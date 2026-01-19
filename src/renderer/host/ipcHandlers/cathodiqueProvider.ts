import z from "zod";
import { LocalModule, RemoteModule } from "../classes/module.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { ShouldHaveBeenZodError, stringStartsWithDollar } from "../utils/utils.js";
import { OrderedPeer } from "../classes/orderedPeer.js";

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #toModule: LocalModule;
  #fromModule: RemoteModule;
  #peer: OrderedPeer;
  constructor(fromModule: RemoteModule, toModule: LocalModule, peer: OrderedPeer) {
    this.#fromModule = fromModule;
    this.#toModule = toModule;
    this.#peer = peer;

    this.#init();
  }
  async #init() {
    await this.#toModule.localHandle.ready;
    await this.#peer.rpc("moduleReady", {
      componentList: [...this.#toModule.localHandle.componentClasses.keys()],
    });
  }

  get #componentList() {
    return this.#toModule.localHandle;
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string().refine((className) => this.#toModule.localHandle.has(className)),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #createInstance({ data }: { data: { className: string; args: WrappedValue[] } }) {
    // TODO Obj verification
    const ClassObj = this.#toModule.localHandle.get(data.className);
    if (!ClassObj) throw new Error("No such component");

    const unwrapped = await Promise.all(data.args.map(async (v: WrappedValue) => unwrapValue(v, this.#fromModule)));

    const componentInstance = await ClassObj.create(...unwrapped);

    await componentInstance.init();
    return componentInstance.componentId;
  }

  instanceExists(arg: Record<string, any>) {
    return this.#instanceExists(z.object({
      data: z.object({
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  #instanceExists({ data }: { data: { componentId: string } }) {
    return this.#componentList.instanceExists(data.componentId);
  }

  getInstanceData(arg: Record<string, any>) {
    return this.#getInstanceData(z.object({
      data: z.object({
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  #getInstanceData({ data }: { data: { componentId: string } }) {
    const instance = this.#componentList.componentInstances.get(data.componentId);
    return instance && {
      componentName: this.#toModule.localHandle.componentTypeOf(instance),
    };
  }

  getProperty(arg: Record<string, any>) {
    return this.#getProperty(z.object({
      data: z.object({
        propertyName: z.string().startsWith("$"),
        componentId: z.string().refine((cId) => this.#componentList.instanceExists(cId)),
      }),
    }).parse(arg));
  }
  async #getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = this.#componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    const propertyName = data.propertyName;
    if (!stringStartsWithDollar(propertyName)) throw new ShouldHaveBeenZodError();
    const value = component[propertyName];

    console.log({ value });

    return wrapValue(value);
  }

  callProperty(arg: Record<string, any>) {
    return this.#callProperty(z.object({
      data: z.object({
        methodName: z.string(),
        arguments: z.array(z.any()),
        componentId: z.string().refine((cId) => this.#componentList.instanceExists(cId)),
      }),
    }).parse(arg));
  }
  async #callProperty({ data }: {
    data: {
      methodName: string;
      arguments: any[];
      componentId: string;
    };
  }) {
    const component = this.#componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    const methodName = data.methodName;
    if (!stringStartsWithDollar(methodName)) throw new ShouldHaveBeenZodError();
    const value = await component[methodName](...data.arguments);

    return wrapValue(value);
  }

  listenToEvent(arg: Record<string, any>) {
    return this.#listenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string().refine((cId) => this.#componentList.instanceExists(cId)),
      }),
    }).parse(arg));
  }
  async #listenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = this.#componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.listenFor(data.eventName, this.#peer);
  }

  unlistenToEvent(arg: Record<string, any>) {
    return this.#unlistenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string().refine((cId) => this.#componentList.instanceExists(cId)),
      }),
    }).parse(arg));
  }
  async #unlistenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = this.#componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.unlistenFor(data.eventName, this.#peer);
  }
};
