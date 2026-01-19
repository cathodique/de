import z from "zod";
import { HandlerContext } from "../utils/types.js";
import { RemoteModule } from "../classes/module.js";
import { unwrapValue, WrappedValue, zodWrappedValue } from "../utils/wrap.js";
import { Latch } from "../classes/latch.js";

export class CathodiqueAvailableComponentsHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #availableComponents: Latch<string[]>;

  constructor(availableComponentsLatch: Latch<string[]>) {
    this.#availableComponents = availableComponentsLatch;
  }

  moduleReady(args: Record<string, any>) {
    return this.#moduleReady(z.object({
      data: z.object({ componentList: z.array(z.string()) }),
    }).parse(args));
  }
  async #moduleReady({ data }: { data: { componentList: string[] } }) {
    this.#availableComponents.resolve?.(data.componentList);
  }
}

export class CathodiqueConsumerHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #module: RemoteModule;

  constructor(module: RemoteModule) {
    this.#module = module;
  }

  emitEvent(arg: Record<string, any>) {
    return this.#emitEvent(z.object({
      data: z.object({
        eventName: z.string(),
        componentId: z.string(),
        args: z.array(zodWrappedValue),
      }),
    }).parse(arg));
  }
  async #emitEvent({ data }: { data: { eventName: string, componentId: string, args: WrappedValue[] } }) {
    const unwrappedArgs = await Promise.all(data.args.map((v) => unwrapValue(v, this.#module.peer)));
    this.#module.getInstanceProxy(data.componentId)?.emit(data.eventName, ...unwrappedArgs);
  }
};
