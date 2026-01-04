import z from "zod";
import { BaseModule, RemoteModule } from "../classes/module.js";
import { orchestrator } from "../classes/orchestrator.js";
import { WithTransfer } from "../classes/withTransfer.js";
import { HandlerContext } from "../utils/types.js";

export class CathodiqueHostHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #mod: RemoteModule;

  constructor (mod: RemoteModule) {
    this.#mod = mod;
  }

  getDependency(arg: Record<string, any>) {
    return this.#getDependency(z.object({
      data: z.object({
        dependency: z.string(),
      }),
    }).parse(arg));
  }
  async #getDependency({ data }: { data: { dependency: string } }) {
    const module = await orchestrator.load(data.dependency);

    if (!module) return undefined;

    const consumerPort = await module.getRemoteHandle(this.#mod);
    const moduleId = module.opaqueToken;

    return new WithTransfer({ port: consumerPort, id: moduleId }, [consumerPort]);
  }

  getAllDependency(arg: Record<string, any>) {
    return this.#getAllDependency(z.object({
      data: z.object({
        dependency: z.string(),
      }),
    }).parse(arg));
  }
  async #getAllDependency({ data }: { data: { dependency: string } }) {
    const modules = await orchestrator.loadAll(data.dependency);

    if (!modules) return [];

    const messagePorts: MessagePort[] = [];

    // Map with side effect
    const handles = await Promise.all(modules.map(async function (this: CathodiqueHostHandler, mod: BaseModule) {
      const messagePort = await mod.getRemoteHandle(this.#mod);
      messagePorts.push(messagePort);

      return { port: messagePort, id: mod.opaqueToken };
    }.bind(this)));

    return new WithTransfer(handles, [handles]);
  }

  establishConnection(arg: Record<string, any>) {
    return this.#establishConnection(z.object({
      data: z.object({
        from: z.string().refine((v) => RemoteModule.moduleById(v)),
        to: z.string().refine((v) => RemoteModule.moduleById(v)),
      }),
    }).parse(arg));
  }
  async #establishConnection({ data }: { data: { from: string, to: string } }) {
    const fromModule = BaseModule.moduleById(data.from)! as RemoteModule;
    const toModule = BaseModule.moduleById(data.to)! as RemoteModule;

    const port = await fromModule.getRemoteHandle(toModule);
    await toModule.submitRemoteHandle(port, fromModule);
  }
};
