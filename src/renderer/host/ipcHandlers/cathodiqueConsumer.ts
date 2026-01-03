import z from "zod";
import { KeyedLatch } from "../classes/latch.js";
import { HandlerContext } from "../utils/types.js";

export class CathodiqueConsumerHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #instanceReady: KeyedLatch<string, void>;

  constructor(instanceReady: KeyedLatch<string, void>) {
    this.#instanceReady = instanceReady;
  }

  componentRegistered(arg: Record<string, any>) {
    return this.#componentRegistered(z.object({ data: z.object({ componentName: z.string() }) }).parse(arg));
  }
  async #componentRegistered({ data }: { data: { componentName: string } }) {
    this.#instanceReady.resolve(data.componentName, undefined);
  }
};
