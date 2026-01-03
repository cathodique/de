export class DummyNodeRegistry {
  static registryPerSource = new WeakMap<MessageEventSource, DummyNodeRegistry>();

  static registryOf(source: MessageEventSource) {
    return this.registryPerSource.get(source);
  }
  static setRegistry(source: MessageEventSource, nr: DummyNodeRegistry) {
    if (DummyNodeRegistry.registryPerSource.has(source)) throw new Error("Only one NodeRegistry per window may exist");
    return this.registryPerSource.set(source, nr);
  }

  nodeToId = new WeakMap<Node, string>();
  idToNode = new Map<string, WeakRef<Node>>();

  source: MessageEventSource;

  constructor(source: MessageEventSource) {
    this.source = source;
    DummyNodeRegistry.setRegistry(source, this);
  }

  hasNode(node: Node) {
    return this.nodeToId.has(node);
  }
  getNode(id: string) {
    if (this.idToNode.has(id)) {
      const result = this.idToNode.get(id)!.deref();
      if (result) return result;
    }

    const node = document.createElement("div");

    this.nodeToId.set(node, id);
    this.idToNode.set(id, new WeakRef(node));
    return node;
  }

  getId(node: Node) {
    return this.nodeToId.get(node);
  }
}
