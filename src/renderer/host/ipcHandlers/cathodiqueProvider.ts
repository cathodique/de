import z from "zod";
import { LocalModule, RemoteModule } from "../classes/module.js";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, wrapValue, zodWrappedValue } from "../utils/wrap.js";
import { ComponentHandle } from "../classes/component.js";

export class CathodiqueProviderHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #toModule: LocalModule;
  #fromModule: RemoteModule;
  constructor(fromModule: RemoteModule, toModule: LocalModule) {
    this.#fromModule = fromModule;
    this.#toModule = toModule;
  }

  static #componentInstancesByModule = new Map<LocalModule, Map<string, any>>();
  get #componentInstances() {
    const result = CathodiqueProviderHandler.#componentInstancesByModule.get(this.#toModule) || new Map<string, any>();
    if (!CathodiqueProviderHandler.#componentInstancesByModule.has(this.#toModule)) {
      CathodiqueProviderHandler.#componentInstancesByModule.set(this.#toModule, result);
    }
    return result;
  }

  createInstance(arg: Record<string, any>) {
    return this.#createInstance(z.object({
      data: z.object({
        className: z.string(),
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
    const componentInstance = new ClassObj(...unwrapped) as ComponentHandle;

    await componentInstance.init();

    this.#componentInstances.set(await componentInstance.componentId, componentInstance);
    return;
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
    const component = this.#componentInstances.get(data.componentId);

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
    const component = this.#componentInstances.get(data.componentId);

    const value = await component?.[data.methodName]?.(...data.arguments);

    return wrapValue(value);
  }
};
