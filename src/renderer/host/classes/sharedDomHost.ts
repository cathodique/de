import { NodeFromIpc } from "../utils/types.js";

class NodeData {
  node: Node;
  eventMap = new Map<string, (v: Event) => void>();
  registry: OtherNodeRegistry;

  constructor(node: Node, reg: OtherNodeRegistry) {
    this.node = node;
    this.registry = reg;
  }

  registerEventListener(event: string, fn: (v: Event) => void) {
    this.eventMap.set(event, fn);
    return fn;
  }
  deregisterEventListener(event: string) {
    const temp = this.eventMap.get(event);
    if (!temp) throw new Error("Event not been registered through NodeData");
    this.eventMap.delete(event);
    return temp;
  }
}

export class OtherNodeRegistry {
  static registryPerWindow = new WeakMap<WindowProxy, OtherNodeRegistry>();

  static registryOf(win: WindowProxy) {
    return this.registryPerWindow.get(win);
  }
  static setRegistry(win: WindowProxy, nr: OtherNodeRegistry) {
    if (OtherNodeRegistry.registryPerWindow.has(win)) throw new Error("Only one NodeRegistry per window may exist");
    return this.registryPerWindow.set(win, nr);
  }

  nodeToId = new WeakMap<Node, string>();
  idToNode = new Map<string, WeakRef<Node>>();
  nodeData = new WeakMap<Node, NodeData>();
  nodeDataOf(node: Node) {
    return this.nodeData.get(node);
  }

  win: WindowProxy;

  constructor(win: WindowProxy) {
    this.win = win;
  }

  hasNode(node: Node) {
    return this.nodeToId.has(node);
  }
  getNode(id: string) {
    return this.idToNode.get(id)?.deref();
  }

  setNodeId(node: Node, id: string) {
    this.nodeToId.set(node, id);
    this.idToNode.set(id, new WeakRef(node));

    this.nodeData.set(node, new NodeData(node, this));

    return node;
  }

  changeOwnership(id: string, node: Node) {
    const originalNode = this.getNode(id);
    if (!originalNode) throw new Error();

    switch (node.nodeType) {
      case Node.TEXT_NODE: {
        if (!(originalNode instanceof Text)) throw new Error("Node type mismatch");

        node.nodeValue = originalNode.nodeValue;

        break;
      }
      case Node.ELEMENT_NODE: {
        if (!(originalNode instanceof Element)) throw new Error("Node type mismatch");

        const el = node as Element;
        if (originalNode.tagName !== el.tagName) throw new Error("Tag name mismatch");

        for (const attr of Array.from(originalNode.attributes)) {
          el.setAttributeNode(attr);
        }

        for (const child of Array.from(originalNode.childNodes)) {
          el.appendChild(child);
        }

        break;
      }
      case Node.DOCUMENT_FRAGMENT_NODE: {
        if (!(originalNode instanceof DocumentFragment)) throw new Error("Node type mismatch");

        const docFrag = node as DocumentFragment;
        for (const child of Array.from(originalNode.childNodes)) {
          docFrag.appendChild(child);
        }

        break;
      }
      default:
        break;
    }
    this.setNodeId(node, id);
    this.nodeToId.delete(originalNode);
  }

  getId(node: Node) {
    return this.nodeToId.get(node);
  }

  deserializeNode(serializedNode: NodeFromIpc): Node {
    switch (serializedNode.kind) {
      case "element": {
        const newEl = document.createElement(serializedNode.tagName);

        for (const [namespaceURI, name, value] of serializedNode.attributes) {
          if (name === "id") continue;
          newEl.setAttributeNS(namespaceURI, name, value);
        }

        for (const kidId of serializedNode.children) {
          newEl.append(this.getNode(kidId)!);
        }

        if (newEl instanceof HTMLTemplateElement && serializedNode.content) {
          this.changeOwnership(serializedNode.content, newEl.content);
        }

        return newEl;
      }

      case "text": {
        return new Text(serializedNode.content);
      }

      case "document_fragment": {
        const newEl = document.createDocumentFragment();

        for (const kidId of serializedNode.children) {
          newEl.appendChild(this.getNode(kidId)!);
        }

        return newEl;
      }

      default: {
        return new Comment(`Node of type ${serializedNode.nodeType}`);
      }
    }
  }

  registerEvent (node: Node, event: string, evtHandler: (v: Event) => any) {
    this.nodeDataOf(node)!.registerEventListener(event, evtHandler);
    node.addEventListener(event, evtHandler);
  }
  unregisterEvent (node: Node, event: string) {
    const eventListener = this.nodeDataOf(node)!.deregisterEventListener(event);
    node.removeEventListener(event, eventListener);
  }
}
