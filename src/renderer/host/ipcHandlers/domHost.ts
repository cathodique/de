import { EventFromIpc, HandlerContext, NodeFromIpc, zodNodeFromIpc } from "../utils/types.js";
import { RemoteModule } from "../classes/module.js";
import { OtherNodeRegistry } from "../classes/sharedDomHost.js";
import z from "zod";

function allProperties(obj: any) {
  const result = [];
  for (const prop in obj) {
    result.push(prop);
  }
  return result;
}

export class DOMHostHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  #source: MessageEventSource;
  #module: RemoteModule;
  constructor(source: MessageEventSource, module: RemoteModule) {
    this.#source = source;
    this.#module = module;
  }

  get #nodeReg() {
    return OtherNodeRegistry.registryOf(this.#source)!;
  }

  #serializeEvent(evt: Event): EventFromIpc {
    return {
      type: evt.type,
      className: evt.constructor.name,
      values: Object.fromEntries(
        allProperties(evt.constructor.prototype)
          .map((v) => [v, evt[v as keyof typeof evt]])
          .filter(([k, v]) => !["function"].includes(typeof v)) // Array if we want to add more types lol
          .map(([k, v]) => {
            if (v instanceof Node) {
              if (this.#nodeReg.hasNode(v)) {
                return [k, { nodeId: this.#nodeReg.getId(v) }];
              }
              return [k, undefined];
            }

            try {
              structuredClone(v);
              return [k, { value: v }];
            } catch {
              return [k, undefined];
            }
          })
      ),
    };
  }

  async createNode(arg: Record<string, any>) {
    return this.#createNode(z.object({
      data: z.object({
        id: z.string(),
        payload: zodNodeFromIpc,
        events: z.array(z.string()),
      }),
    }).parse(arg));
  }
  #createNode({ data }: { data: { id: string, payload: NodeFromIpc, events: string[] } }) {
    const node = this.#nodeReg.deserializeNode(data.payload);
    this.#nodeReg.setNodeId(node, data.id);

    for (const event of data.events) {
      this.#nodeReg.registerEvent(node, event, async function (this: DOMHostHandler, v: Event) {
        const ipc = await this.#module.peer;

        await ipc.rpc("domEmitEvent", { id: data.id, event: this.#serializeEvent(v) });
      }.bind(this));
    }
  }

  async deleteNode(arg: Record<string, any>) {
    return this.#deleteNode(z.object({
      data: z.object({
        id: z.string(),
      }),
    }).parse(arg));
  }
  #deleteNode({ data }: { data: { id: string } }) {
    this.#nodeReg.deleteNode(data.id);
  }
};
