import { EventFromIpc, NodeFromIpc } from "../../.common/utils/types.js";
import { Module } from "../classes/module.js";
import { OtherNodeRegistry } from "../classes/sharedDomHost.js";

function allProperties(obj: any) {
  const result = [];
  for (const prop in obj) {
    result.push(prop);
  }
  return result;
}

export class DOMHostHandler {
  win: WindowProxy;
  module: Module;
  constructor(win: WindowProxy, module: Module) {
    this.win = win;
    this.module = module;
  }

  get nodeReg() {
    return OtherNodeRegistry.registryOf(this.win)!;
  }

  serializeEvent(evt: Event): EventFromIpc {
    return {
      type: evt.type,
      className: evt.constructor.name,
      values: Object.fromEntries(
        allProperties(evt.constructor.prototype)
          .map((v) => [v, evt[v as keyof typeof evt]])
          .filter(([k, v]) => !["function"].includes(typeof v))
          .map(([k, v]) => {
            if (v instanceof Node) {
              if (this.nodeReg.hasNode(v)) {
                return [k, { nodeId: this.nodeReg.getId(v) }];
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
  createNode({ data }: { data: { id: string, payload: NodeFromIpc, events: string[] } }) {
    console.log(data);
    const node = this.nodeReg.deserializeNode(data.payload);
    this.nodeReg.setNodeId(node, data.id);
    for (const event of data.events) {
      this.nodeReg.registerEvent(node, event, async function (this: DOMHostHandler, v: Event) {
        const ipc = await this.module.peer;

        await ipc.rpc("domEmitEvent", { id: data.id, event: this.serializeEvent(v) });
      }.bind(this));
    }
  }
};
