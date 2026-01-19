import { parentIpc } from "../parentIpc";
import { OrderedPeer } from "./orderedPeer";
import { NodeRegistry, SharedDOM } from "./sharedDomRemote";

export class DummyNodeRegistry {
  static registryPerSource = new WeakMap<OrderedPeer, DummyNodeRegistry>();

  static registryOf(source: OrderedPeer) {
    return this.registryPerSource.get(source);
  }
  static setRegistry(source: OrderedPeer, nr: DummyNodeRegistry) {
    if (DummyNodeRegistry.registryPerSource.has(source)) throw new Error("Only one NodeRegistry per window may exist");
    return this.registryPerSource.set(source, nr);
  }

  nodeToId = new WeakMap<Node, string>();
  idToNode = new Map<string, WeakRef<Node>>();

  source: OrderedPeer;

  constructor(source: OrderedPeer) {
    this.source = source;
  }

  hasNode(node: Node) {
    return this.nodeToId.has(node);
  }
  async getNode(id: string) {
    if (this.idToNode.has(id)) {
      const result = this.idToNode.get(id)!.deref();
      if (result) return result;
    }

    const node = document.createElement("div");

    const actualId = await SharedDOM.initOrGet(node);
    await parentIpc.rpc("containForeign", {
      id: actualId,
      toId: id,
      toOpaqueToken: this.source.opaqueToken,
    });

    this.nodeToId.set(node, id);
    this.idToNode.set(id, new WeakRef(node));
    return node;
  }

  getId(node: Node) {
    return this.nodeToId.get(node);
  }
}
