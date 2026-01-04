import z from "zod";
import { LocalModule, RemoteModule } from "../classes/module.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { Component, ComponentHandle } from "../classes/component.js";
import { ShouldHaveBeenZodError, stringStartsWithDollar } from "../utils/utils.js";

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #toModule: LocalModule;
  #fromModule: RemoteModule;
  constructor(fromModule: RemoteModule, toModule: LocalModule) {
    this.#fromModule = fromModule;
    this.#toModule = toModule;
  }

  static #componentInstancesByModule = new Map<LocalModule, Map<string, Component>>();
  get #componentInstances() {
    const result = CathodiqueProviderHandler.#componentInstancesByModule.get(this.#toModule) || new Map<string, Component>();
    if (!CathodiqueProviderHandler.#componentInstancesByModule.has(this.#toModule)) {
      CathodiqueProviderHandler.#componentInstancesByModule.set(this.#toModule, result);
    }
    return result;
  }
  #componentExists(id: string) {
    this.#componentInstances.has(id);
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string().refine(this.#toModule.localHandle.has),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #createInstance({ data }: { data: { className: string; args: WrappedValue[] } }) {
    // TODO Obj verification
    const ClassObj = this.#toModule.localHandle.get(data.className);
    if (!ClassObj) return; // Quiet fail

    const unwrapped = await Promise.all(data.args.map(async function (this: CathodiqueProviderHandler, v: WrappedValue) {
      return unwrapValue(v, this.#fromModule)
    }.bind(this)));
    const componentInstance = new ClassObj(...unwrapped);

    await componentInstance.init();

    this.#componentInstances.set(componentInstance.componentId, componentInstance);
    return;
  }

  getProperty(arg: Record<string, any>) {
    return this.#getProperty(z.object({
      data: z.object({
        propertyName: z.string().startsWith("$"),
        componentId: z.string().refine(this.#componentExists),
      }),
    }).parse(arg));
  }
  async #getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = this.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    const propertyName = data.propertyName;
    if (!stringStartsWithDollar(propertyName)) throw new ShouldHaveBeenZodError();
    const value = component[propertyName];

    return wrapValue(value);
  }

  callProperty(arg: Record<string, any>) {
    return this.#callProperty(z.object({
      data: z.object({
        methodName: z.string(),
        arguments: z.array(z.any()),
        componentId: z.string().refine(this.#componentExists),
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
    const component = this.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    const methodName = data.methodName;
    if (!stringStartsWithDollar(methodName)) throw new ShouldHaveBeenZodError();
    const value = await component[methodName](...data.arguments);

    return wrapValue(value);
  }

  listenToEvent(arg: Record<string, any>) {
    return this.#listenToEvent(z.object({
      data: z.object({
        eventName: z.string().startsWith("$"),
        componentId: z.string().refine(this.#componentExists),
      }),
    }).parse(arg));
  }
  async #listenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = this.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.listenFor(data.eventName, await this.#fromModule.peer);
  }

  unlistenToEvent(arg: Record<string, any>) {
    return this.#unlistenToEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string().refine(this.#componentExists),
      }),
    }).parse(arg));
  }
  async #unlistenToEvent({ data }: {
    data: {
      eventName: string;
      componentId: string;
    };
  }) {
    const component = this.#componentInstances.get(data.componentId);
    if (!component) throw new ShouldHaveBeenZodError();

    component.unlistenFor(data.eventName, await this.#fromModule.peer);
  }
};
