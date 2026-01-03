import z from "zod";
import { RemoteModule } from "../classes/module.js";
import { OrderedPeer } from "../classes/orderedPeer.js";
import { HandlerContext } from "../utils/types.js";
import { CathodiqueProviderHandler } from "./cathodiqueProvider.js";

export class CathodiqueRemoteHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  constructor() {}

  connectAsProvider(arg: Record<string, any>) {
    return this.#connectAsProvider(z.object({
      data: z.object({
        port: z.instanceof(MessagePort),
        moduleToken: z.string(),
      }),
    }).parse(arg));
  }
  #connectAsProvider({ data }: { data: { port: MessagePort, moduleToken: string } }) {
    const module = RemoteModule.getOrCreate(data.port, data.moduleToken);
    // TODO Expose self as provider

    // Note: We can trust this messageport (unless vuln) because the parent is trusted to be raytube
    const peer = new OrderedPeer(data.port, "*");
    peer.addHandler(new CathodiqueProviderHandler(module) as any);
  }

  connectAsConsumer(arg: Record<string, any>) {
    return this.#connectAsConsumer(z.object({
      data: z.object({
        port: z.instanceof(MessagePort),
        moduleToken: z.string(),
      }),
    }).parse(arg));
  }
  #connectAsConsumer({ data }: { data: { port: MessagePort, moduleToken: string } }) {
    // This is for, if *this* module wishes to connect to another module.

    RemoteModule.createModule(data.port, data.moduleToken);
    // The rest will be handled by remoteToLocalAdapter.ts
  }
}
