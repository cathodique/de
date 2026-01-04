import z from "zod";
import { HandlerContext } from "../utils/types.js";
import { unwrapValue, WrappedValue, zodWrappedValue } from "../utils/wrap.js";
import { RemoteModule } from "../classes/module.js";

export class CathodiqueConsumerHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #module: RemoteModule;

  constructor(module: RemoteModule  ) {
    this.#module = module;
  }

  componentRegistered(arg: Record<string, any>) {
    return this.#componentRegistered(z.object({ data: z.object({ componentName: z.string() }) }).parse(arg));
  }
  async #componentRegistered({ data }: { data: { componentName: string } }) {
    this.#module.componentReady.resolve(data.componentName, undefined);
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
    const unwrappedArgs = data.args.map((v) => unwrapValue(v, this.#module));
    (await this.#module.getComponent(data.componentId))?.emit(data.eventName, ...unwrappedArgs);
  }
};
