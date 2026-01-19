import z from "zod";
import { RemoteModule } from "../classes/module.js";
import { OrderedPeer } from "../classes/orderedPeer.js";
import { HandlerContext } from "../utils/types.js";
import { CathodiqueProviderHandler } from "./cathodiqueProvider.js";
import { Latch } from "../classes/latch.js";

const moduleIdLatch = new Latch<string>();
export const moduleId = moduleIdLatch.promise;

export class CathodiqueRemoteHandler {
  static instance: CathodiqueRemoteHandler;
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  constructor() {
    if (CathodiqueRemoteHandler.instance) throw new Error("Remote is a singleton.");
    CathodiqueRemoteHandler.instance = this;
  }

  moduleId(arg: Record<string, any>) {
    return this.#moduleId(z.object({
      data: z.object({
        moduleId: z.string(),
      }),
    }).parse(arg));
  }
  #moduleId({ data }: { data: { moduleId: string } }) {
    moduleIdLatch.resolve!(data.moduleId);
  }

  connectAsProvider(arg: Record<string, any>) {
    return this.#connectAsProvider(z.object({
      data: z.object({
        port: z.instanceof(MessagePort),
        opaqueToken: z.string().optional(),
      }),
    }).parse(arg));
  }
  async #connectAsProvider({ data }: { data: { port: MessagePort, opaqueToken?: string } }) {
    // const module = await RemoteModule.getOrCreate(data.port, data.moduleToken);
    // TODO Expose self as provider

    // Note: We can trust this messageport (unless vuln) because the parent is trusted to be raytube
    const peer = new OrderedPeer(data.port, data.opaqueToken, "*");
    peer.addHandler(new CathodiqueProviderHandler(peer) as any);
  }
}
