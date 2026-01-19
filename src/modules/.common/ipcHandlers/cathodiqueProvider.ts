import z from "zod";
import { componentList, ComponentList } from "../classes/componentList.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { Component } from "../classes/component.js";
import { ShouldHaveBeenZodError, stringStartsWithDollar } from "../utils/utils.js";
import { parentIpc } from "../parentIpc.js";
import { OrderedPeer } from "../classes/orderedPeer.js";

// DISTINCTIONS WITH HOST
// A single module has a single componentList
// So componentList need be static

// A single module determines its own IDs thus makes ID attacks impossible
// So componentInstances need be static

// TODO: Manage lifecycle of component

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  static #componentList: ComponentList = componentList;

  #peer: OrderedPeer;
  constructor(peer: OrderedPeer) {
    this.#peer = peer;

    this.#init();
  }
  async #init() {
    await componentList.ready;
    await this.#peer.rpc("moduleReady", {
      componentList: [...componentList.componentClasses.keys()],
    });
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string().refine(CathodiqueProviderHandler.#componentList.has
          .bind(CathodiqueProviderHandler.#componentList)),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #createInstance({ data }: { data: { className: string, args: WrappedValue[] } }) {
    // alert(1);
    const ClassObj = CathodiqueProviderHandler.#componentList.get(data.className);
    if (!ClassObj) throw new ShouldHaveBeenZodError();

    const unwrapped = await Promise.all(data.args.map((v: WrappedValue) => unwrapValue(v, this.#peer)));
    const pctx = {};

    const componentInstance = (await ClassObj.create(pctx, ...unwrapped)) as Component;

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
    return componentList.componentInstances.has(data.componentId);
  }

  getInstanceData(arg: Record<string, any>) {
    return this.#getInstanceData(z.object({
      data: z.object({
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  #getInstanceData({ data }: { data: { componentId: string } }) {
    const instance = componentList.componentInstances.get(data.componentId);
    return instance && {
      componentName: componentList.componentTypeOf(instance),
    };
  }

  getProperty(arg: Record<string, any>) {
    return this.#getProperty(z.object({
      data: z.object({
        propertyName: z.string().startsWith("$"),
        componentId: z.string().refine(componentList.instanceExists
          .bind(componentList)),
      }),
    }).parse(arg));
  }
  async #getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    // Zod...
    const propertyName = data.propertyName;
    if (!stringStartsWithDollar(propertyName)) throw new ShouldHaveBeenZodError();

    const value = component[propertyName];

    return wrapValue(value);
  }

  callProperty(arg: Record<string, any>) {
    return this.#callProperty(z.object({
      data: z.object({
        methodName: z.string().startsWith('$'),
        arguments: z.array(z.any()),
        componentId: z.string().refine(componentList.instanceExists
          .bind(componentList)),
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
    const component = componentList.componentInstances.get(data.componentId)!;

    // Zod...
    const methodName = data.methodName;
    if (!stringStartsWithDollar(methodName)) throw new ShouldHaveBeenZodError();

    const value = await component?.[methodName]?.(...data.arguments);

    return wrapValue(value);
  }

  listenToEvent(arg: Record<string, any>) {
    return this.#listenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  async #listenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.listenFor(data.eventName, this.#peer ?? parentIpc);
  }

  unlistenToEvent(arg: Record<string, any>) {
    return this.#unlistenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string().refine(componentList.instanceExists
          .bind(componentList)),
      }),
    }).parse(arg));
  }
  async #unlistenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = componentList.componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.unlistenFor(data.eventName, this.#peer ?? parentIpc);
  }
};
