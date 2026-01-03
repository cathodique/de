import z from "zod";
import { componentList, ComponentList } from "../classes/componentList.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { Component } from "../classes/component.js";
import { RemoteModule } from "../classes/module.js";

// DISTINCTIONS WITH HOST
// A single module has a single componentList
// So componentList need be static

// A single module determines its own IDs thus makes ID attacks impossible
// So componentInstances need be static

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  static #componentList: ComponentList = componentList;

  static #componentInstances = new Map<string, any>();

  #fromModule: RemoteModule | undefined;
  constructor(fromModule: RemoteModule | undefined) {
    this.#fromModule = fromModule;
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string(),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #createInstance({ data }: { data: { className: string, args: WrappedValue[] } }) {
    const ClassObj = CathodiqueProviderHandler.#componentList.get(data.className);
    if (!ClassObj) return; // TODO error here

    const unwrapped = data.args.map(function (this: CathodiqueProviderHandler, v: WrappedValue) {
      return unwrapValue(v, this.#fromModule)
    }.bind(this));
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

  getProperty(arg: Record<string, any>) {
    return this.#getProperty(z.object({
      data: z.object({
        propertyName: z.string(),
        componentId: z.string(),
      }),
    }).parse(arg));
  }
  async #getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId);

    const value = component[data.propertyName];

    return wrapValue(value);
  }

  callProperty(arg: Record<string, any>) {
    return this.#callProperty(z.object({
      data: z.object({
        methodName: z.string(),
        arguments: z.array(z.any()),
        componentId: z.string(),
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
    const component = CathodiqueProviderHandler.#componentInstances.get(data.componentId);

    const value = await component?.[data.methodName]?.(...data.arguments);

    return wrapValue(value);
  }
};
