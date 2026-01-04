import z from "zod";
import { componentList, ComponentList } from "../classes/componentList.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { Component } from "../classes/component.js";
import { RemoteModule } from "../classes/module.js";
import { ShouldHaveBeenZodError, stringStartsWithDollar } from "../utils/utils.js";
import { parentIpc } from "../parentIpc.js";

// DISTINCTIONS WITH HOST
// A single module has a single componentList
// So componentList need be static

// A single module determines its own IDs thus makes ID attacks impossible
// So componentInstances need be static

// TODO: Manage lifecycle of component

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  static #componentList: ComponentList = componentList;

  static #componentInstances = new Map<string, Component>();
  static componentExists(id: string) {
    return this.#componentInstances.has(id);
  }

  #fromModule: RemoteModule | undefined;
  constructor(fromModule: RemoteModule | undefined) {
    this.#fromModule = fromModule;
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string().refine(CathodiqueProviderHandler.#componentList.has),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #createInstance({ data }: { data: { className: string, args: WrappedValue[] } }) {
    const ClassObj = CathodiqueProviderHandler.#componentList.get(data.className);
    if (!ClassObj) throw new ShouldHaveBeenZodError();

    const unwrapped = data.args.map((v: WrappedValue) => unwrapValue(v, this.#fromModule));
    const componentInstance = new ClassObj(...unwrapped) as Component;

    await componentInstance.init();

    CathodiqueProviderHandler.#componentInstances.set(
      componentInstance.componentId,
      componentInstance,
    );
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
    return CathodiqueProviderHandler.#componentInstances.has(data.componentId);
  }

  getInstanceData(arg: Record<string, any>) {
    return this.#getInstanceData(z.object({
      data: z.object({
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  #getInstanceData({ data }: { data: { componentId: string } }) {
    const instance = CathodiqueProviderHandler.#componentInstances.get(data.componentId);
    return instance && {
      componentName: componentList.componentTypeOf(instance),
    };
  }

  getProperty(arg: Record<string, any>) {
    return this.#getProperty(z.object({
      data: z.object({
        propertyName: z.string().startsWith("$"),
        componentId: z.string().refine(CathodiqueProviderHandler.componentExists),
      }),
    }).parse(arg));
  }
  async #getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId);
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
        componentId: z.string().refine(CathodiqueProviderHandler.componentExists),
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
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId)!;

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
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.listenFor(data.eventName, this.#fromModule?.peer ?? parentIpc);
  }

  unlistenToEvent(arg: Record<string, any>) {
    return this.#unlistenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string().refine(CathodiqueProviderHandler.componentExists),
      }),
    }).parse(arg));
  }
  async #unlistenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.unlistenFor(data.eventName, this.#fromModule?.peer ?? parentIpc);
  }
};
