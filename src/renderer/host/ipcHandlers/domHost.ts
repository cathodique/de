import { EventFromIpc, HandlerContext, NodeFromIpc, zodNodeFromIpc } from "../utils/types.js";
import { BaseModule, RemoteModule } from "../classes/module.js";
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

  #win: WindowProxy;
  #module: RemoteModule;
  constructor(source: WindowProxy, module: RemoteModule) {
    this.#win = source;
    this.#module = module;
  }

  get #nodeReg() {
    return OtherNodeRegistry.registryOf(this.#win)!;
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

    // if (node instanceof Element) node.setAttribute("data-rpcid", data.id);

    this.#nodeReg.setNodeId(node, data.id);

    for (const event of data.events) {
      this.#nodeReg.registerEvent(node, event, async (v: Event) => {
        const ipc = this.#module.peer;

        await ipc.rpc("domEmitEvent", { target: data.id, event: this.#serializeEvent(v) });
      });
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

  async containForeign(arg: Record<string, any>) {
    return this.#containForeign(z.object({
      data: z.object({
        id: z.string(),
        toId: z.string(),
        toOpaqueToken: z.string().optional(),
      }),
    }).parse(arg));
  }
  #containForeign({ data }: { data: { id: string, toId: string, toOpaqueToken?: string } }) {
    let win = window as Window;
    if (data.toOpaqueToken) {
      const module = BaseModule.moduleByToken(data.toOpaqueToken);
      if (!module) throw new Error("Module not found");
      win = module.win;
    }

    const toNode = OtherNodeRegistry.registryOf(win)!.getNode(data.toId);
    if (!toNode) throw new Error("Node not found");

    const node = this.#nodeReg.getNode(data.id);
    if (!(node instanceof Element)) throw new Error("Can't contain foreign if node not Element");

    console.log(this.#module.opaqueToken, data.toOpaqueToken, win, node, toNode);

    const shadowRoot = node.attachShadow({ mode: "open" });
    shadowRoot.append(toNode);
  }

  changeAttribute(args: Record<string, any>) {
    this.#changeAttribute(z.object({
      data: z.object({
        target: z.string(),
        name: z.string(),
        namespace: z.string().nullable(),
        value: z.string(),
      }),
    }).parse(args));
  }
  #changeAttribute({ data }: { data: { target: string; name: string; namespace: string | null; value: string } }) {
    const targetNode = this.#nodeReg.getNode(data.target);
    if (!targetNode) throw new Error("Target node does not exist");

    (targetNode as Element).setAttributeNS(data.namespace, data.name, data.value);
  }

  addNodes(args: Record<string, any>) {
    this.#addNodes(z.object({
      data: z.object({
        target: z.string(),
        added: z.array(z.string()),
        before: z.string().nullable(),
      }),
    }).parse(args));
  }
  #addNodes({ data }: { data: { target: string, added: string[], before: string | null } }) {
    const targetNode = this.#nodeReg.getNode(data.target);
    if (!targetNode) throw new Error("Target node does not exist");

    const beforeNode = data.before ? this.#nodeReg.getNode(data.before) : null;
    if (beforeNode === undefined) throw new Error("Before node does not exist");

    for (const addedNodeId of data.added) {
      const addedNode = this.#nodeReg.getNode(addedNodeId);
      if (!addedNode) throw new Error("One of addedNodes does not exist");

      targetNode.insertBefore(addedNode, beforeNode);
    }
  }

  removeNodes(args: Record<string, any>) {
    this.#removeNodes(z.object({
      data: z.object({
        target: z.string(),
        removed: z.array(z.string()),
      }),
    }).parse(args));
  }
  #removeNodes({ data }: { data: { target: string, removed: string[] } }) {
    const targetNode = this.#nodeReg.getNode(data.target);
    if (!targetNode) throw new Error("Target node does not exist");

    for (const removedNodeId of data.removed) {
      const removedNode = this.#nodeReg.getNode(removedNodeId);
      if (!removedNode) throw new Error("One of removedNodes does not exist");

      targetNode.removeChild(removedNode);
    }
  }

  characterData(args: Record<string, any>) {
    this.#characterData(z.object({
      data: z.object({
        target: z.string(),
        value: z.string(),
      }),
    }).parse(args));
  }
  #characterData({ data }: { data: { target: string; value: string } }) {
    const targetNode = this.#nodeReg.getNode(data.target);
    if (!targetNode) throw new Error("Target node does not exist");

    (targetNode as Element).nodeValue = data.value;
  }

  registerEvent(args: Record<string, any>) {
    return this.#registerEvent(z.object({
      data: z.object({
        target: z.string(),
        addedEvent: z.string(),
      }),
    }).parse(args));
  }
  #registerEvent({ data }: { data: { target: string, addedEvent: string } }) {
    const node = this.#nodeReg.getNode(data.target);
    if (!node) throw new Error("Inexistant node");

    this.#nodeReg.registerEvent(node, data.addedEvent, async (v: Event) => {
      const ipc = this.#module.peer;

      await ipc.rpc("domEmitEvent", { target: data.target, event: this.#serializeEvent(v) });
    });
  }

  unregisterEvent(args: Record<string, any>) {
    return this.#unregisterEvent(z.object({
      data: z.object({
        target: z.string(),
        addedEvent: z.string(),
      }),
    }).parse(args));
  }
  #unregisterEvent({ data }: { data: { target: string, addedEvent: string } }) {
    const node = this.#nodeReg.getNode(data.target);
    if (!node) throw new Error("Inexistant node");

    this.#nodeReg.unregisterEvent(node, data.addedEvent);
  }
};
