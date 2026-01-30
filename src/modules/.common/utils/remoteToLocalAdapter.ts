import { Component } from "../classes/component.js";
import { ComponentListHandle } from "../classes/componentList.js";
import { Latch, LatchState } from "../classes/latch.js";
import { RemoteModule } from "../classes/module.js";
import { OrderedPeer } from "../classes/orderedPeer.js";
import { unwrapValue, wrapValue } from "./wrap.js";
import { EventEmitter } from "events";

export class ComponentListProxy implements ComponentListHandle {
  #module: RemoteModule;
  constructor(mod: RemoteModule) {
    this.#module = mod;
  }

  get(componentName: string) {
    const availableComponents = this.#module.availableComponents;

    if (!availableComponents.includes(componentName)) return undefined;

    return {
      create: (...args: any[]) => {
        return makeComponentProxy(this.#module, componentName, { args });
      }
    };
  }
}

export class ComponentInstance extends EventEmitter {
  peer: OrderedPeer;

  module: RemoteModule;

  #args: any[] = [];

  componentName: string;
  constructor(module: RemoteModule, componentName: string, options: { componentId: string } | { args: any[] }) {
    super();
    this.module = module;

    this.peer = this.module.peer;
    this.componentName = componentName;

    if ("componentId" in options) this.#cidLatch.resolve!(options.componentId);
    if ("args" in options) this.#args = options.args;

    // TODO How to clean?
    // Will it undo itself? Since there is no way it can emit and it's not ref'd
    this.on("newListener", async function (this: ComponentInstance, evtName: string) {
      if (evtName === "newListener" || evtName === "removeListener") return;

      if (this.listenerCount(evtName) === 0) {
        this.peer.rpc("listenToEvent", { componentId: await this.componentId, eventName: evtName });
      }
    }.bind(this));
    this.on("removeListener", async function (this: ComponentInstance, evtName: string) {
      if (evtName === "newListener" || evtName === "removeListener") return;

      if (this.listenerCount(evtName) === 0) {
        this.peer.rpc("unlistenToEvent", { componentId: await this.componentId, eventName: evtName });
      }
    }.bind(this));
  }

  #cidLatch = new Latch<string>();
  get componentId() { return this.#cidLatch.promise; }

  ready = new Latch<void>();

  async init() {
    if (this.#cidLatch.getState() === LatchState.Pending) {
      if (!this.module.availableComponents.includes(this.componentName)) {
        throw new Error(`"${this.componentName}" not provided by module`);
      }

      const componentId = await this.peer.rpc("createInstance", {
        className: this.componentName,
        args: await Promise.all(this.#args.map((v) => wrapValue(v))),
      });
      this.#cidLatch.resolve!(componentId);
      this.ready.resolve!();
    } else {
      this.ready.resolve?.();
    }
  }
}
export type ComponentInstanceProxy = ComponentInstance
  & Partial<Record<`$${string}`, any>>
  & { [Component.isComponentSymbol]: true };

function generateCalledOrAwaited({ called, awaited }: { called: (...args: any[]) => any, awaited: () => any }) {
  const result = async function (...args: any[]) {
    return called(...args);
  };
  result.then = async (resolve: (a: any) => void) => {
    resolve(await awaited());
  };
  return result;
}

export function makeComponentProxy(module: RemoteModule, componentName: string, options: { componentId: string } | { args: any[] }): ComponentInstanceProxy {
  if ("componentId" in options && module.instanceProxyExists(options.componentId)) {
    return module.getInstanceProxy(options.componentId)!;
  }

  const compInst = new ComponentInstance(module, componentName, options);
  compInst.init();

  const compInstProxy = new Proxy(compInst, {
    get(target, prop) {
      if (prop === Component.isComponentSymbol) return true;

      if (target[prop as keyof typeof target]) return target[prop as keyof typeof target];

      if (prop === "then") return undefined;

      return generateCalledOrAwaited({
        called: async function (...args: any[]) {
          const id = await compInst.componentId;

          const val = await module.peer.rpc("callProperty", {
            methodName: prop,
            arguments: args.map((v) => wrapValue(v)),
            componentId: id,
          });

          return await unwrapValue(val, module.peer);
        },
        awaited: async () => {
          const id = await compInst.componentId;

          const val = await module.peer.rpc("getProperty", {
            propertyName: prop,
            componentId: id,
          });

          return await unwrapValue(val, module.peer);
        },
      });
    },
  }) as ComponentInstanceProxy;

  (async () => {
    const cid = await compInst.componentId;
    module.registerInstanceProxy(cid, compInstProxy);
  })();

  return compInstProxy;
}
