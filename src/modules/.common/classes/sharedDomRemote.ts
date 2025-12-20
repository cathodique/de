import { parentIpc } from "../parentIpc.js";
import { handlersMap } from "../utils/nodeEventListener.js";
import { nanoid } from "../utils/utils.js";

export class NodeRegistry {
  static nodeToId = new WeakMap<Node, string>();
  static idToNode = new Map<string, WeakRef<Node>>();

  static getNode(id: string) {
    return this.idToNode.get(id)?.deref();
  }

  static hasNode(node: Node) {
    return this.nodeToId.has(node);
  }

  static getId(node: Node): string {
    let id = this.nodeToId.get(node);
    if (!id) {
      id = nanoid();
      this.nodeToId.set(node, id);
      this.idToNode.set(id, new WeakRef(node));
    }
    return id;
  }
}

function serializeEvents(node: Node) {
  return [...(handlersMap.get(node)?.keys() ?? [])];
}

function serializeNode(node: Node) {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element;

      return {
        kind: "element",
        tagName: el.tagName,
        attributes: Array.from(el.attributes).map(a => [
          a.namespaceURI,
          a.name,
          a.value,
        ]),
        children: Array.from(el.childNodes)
          .map(function (this: typeof NodeRegistry, v: Node) {
            return NodeRegistry.getId(v);
          }.bind(NodeRegistry)),
        content: (el as HTMLTemplateElement).content && NodeRegistry.getId((el as HTMLTemplateElement).content),
      };
    }

    case Node.TEXT_NODE:
      return {
        kind: "text",
        content: node.nodeValue,
      };

    case Node.DOCUMENT_FRAGMENT_NODE:
      const el = node as DocumentFragment;
      return {
        kind: "document_fragment",
        children: Array.from(el.childNodes)
          .map(function (this: typeof NodeRegistry, v: Node) {
            return NodeRegistry.getId(v);
          }.bind(NodeRegistry)),
      };

    default:
      return {
        kind: "arbitrary",
        nodeType: node.nodeType,
      };
  }
}

class MutationDispatcher {
  private static observer = new MutationObserver(MutationDispatcher.handle);

  static observe(root: Node) {
    this.observer.observe(root, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
  }

  private static handle(mutations: MutationRecord[]) {
    for (const m of mutations) {
      SharedDOM.handleMutation(m);
    }
  }
}

export class SharedDOM {
  static initOrGet(root: Node) {
    if (NodeRegistry.hasNode(root)) return NodeRegistry.getId(root);
    this.init(root);
    return NodeRegistry.getId(root);
  }

  static init(root: Node) {
    this.registerSubtree(root);
    MutationDispatcher.observe(root);
  }

  static registerSubtree(node: Node) {
    NodeRegistry.getId(node);
    if (node instanceof HTMLTemplateElement) this.registerSubtree(node.content);
    node.childNodes.forEach(function (this: typeof SharedDOM, n: Node) { this.registerSubtree(n) }.bind(this));

    parentIpc.post({
      type: "createNode",
      data: {
        id: NodeRegistry.getId(node),
        payload: serializeNode(node),
        events: serializeEvents(node),
      },
    });
  }

  static handleMutation(m: MutationRecord) {
    const targetId = NodeRegistry.getId(m.target);

    switch (m.type) {
      case "attributes":
        parentIpc.post({
          type: "changeAttribute",
          data: {
            target: targetId,
            name: m.attributeName,
            namespace: m.attributeNamespace,
          },
        });
        break;

      case "childList":
        if (m.addedNodes.length) {
          const ids = Array.from(m.addedNodes, NodeRegistry.getId);
          parentIpc.post({
            type: "addNodes",
            data: {
              target: targetId,
              added: ids,
              before: m.nextSibling && NodeRegistry.getId(m.nextSibling),
            },
          });
        }

        if (m.removedNodes.length) {
          const ids = Array.from(m.removedNodes, NodeRegistry.getId);
          parentIpc.post({
            type: "removeNodes",
            data: {
              target: targetId,
              removed: ids,
            },
          });
        }
        break;

      case "characterData":
        parentIpc.post({
          type: "characterData",
          data: {
            target: targetId,
            value: m.target.nodeValue,
          },
        });
        break;
    }
  }
}
