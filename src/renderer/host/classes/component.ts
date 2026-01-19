import { componentTypes } from "../utils/types.js";
import { nanoid } from "../utils/utils.js";
import { wrapValue } from "../utils/wrap.js";
import { BaseModule, LocalModule } from "./module.js";
import { orchestrator } from "./orchestrator.js";
import { OrderedPeer } from "./orderedPeer.js";

export interface PartialComponentContext { }
export interface ComponentContext extends PartialComponentContext {
  module: LocalModule;
}
export type ComponentHandle = {
  module: BaseModule;
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any };

const isComponentSymbol = Symbol();
export abstract class Component implements ComponentHandle {
  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;

  [x: `$${string}`]: any;

  componentId: string;
  module: LocalModule;

  static type: typeof componentTypes[number] = "NORMAL";

  [isComponentSymbol] = true;
  constructor(module: LocalModule) {
    this.module = module;
    this.componentId = nanoid();

    this.module.localHandle.componentInstances.set(
      this.componentId,
      this,
    );
  }

  init(): any {}

  async getDependency(dependency: string) {
    const newMod = await orchestrator.load(dependency);
    return newMod?.localHandle;
  }
  async getAllDependency(dependency: string) {
    const newMod = await orchestrator.loadAll(dependency);
    return newMod?.map((v) => v.localHandle);
  }
  #listenersFromRemote = new Map<string, Set<OrderedPeer>>();
  listenFor(eventName: string, peer: OrderedPeer) {
    const innerSet = this.#listenersFromRemote.get(eventName) || new Set();
    if (!this.#listenersFromRemote.has(eventName)) this.#listenersFromRemote.set(eventName, innerSet);

    innerSet.add(peer);
  }
  unlistenFor(eventName: string, peer: OrderedPeer) {
    const innerSet = this.#listenersFromRemote.get(eventName) || new Set();

    innerSet.delete(peer);

    if (innerSet.size === 0) this.#listenersFromRemote.delete(eventName);
  }
  async emit(eventName: string, ...args: any[]) {
    const wrapped = await Promise.all(args.map((v) => wrapValue(v)))

    const innerSet = this.#listenersFromRemote.get(eventName);
    if (!innerSet) return;
    for (const peer of innerSet) {
      peer.rpc("emitEvent", {
        componentId: this.componentId,
        eventName: eventName,
        args: wrapped,
      });
    }
  }
};
