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

      console.log(el.cloneNode(true), el);

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
  private static observers = new WeakMap<Node, MutationObserver>();
  private static handle(mutations: MutationRecord[]) {
    for (const m of mutations) {
      SharedDOM.handleMutation(m);
    }
  }

  static observe(root: Node) {
    const observer = new MutationObserver(this.handle);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    this.observers.set(root, observer);
  }

  static disconnect(root: Node) {
    this.observers.get(root)?.disconnect();
    this.observers.delete(root);
  }
}

export class SharedDOM {
  static finReg = new FinalizationRegistry((heldValue) => {
    parentIpc.rpc("deleteNode", { id: heldValue });
  });

  static async initOrGet(root: Node) {
    if (NodeRegistry.hasNode(root)) return NodeRegistry.getId(root);
    await this.init(root);
    return NodeRegistry.getId(root);
  }

  static async init(root: Node) {
    await this.registerSubtree(root);
    MutationDispatcher.observe(root);
  }

  static async registerSubtree(node: Node) {
    if (NodeRegistry.hasNode(node)) {
      // We presuppose it will be registered again by init
      return MutationDispatcher.disconnect(node);
    }

    const id = NodeRegistry.getId(node);
    if (node instanceof HTMLTemplateElement) await this.registerSubtree(node.content);

    await Promise.all(Array.from(node.childNodes).map((n: Node) => this.registerSubtree(n)));

    await parentIpc.rpc("createNode", {
      id: id,
      payload: serializeNode(node),
      events: serializeEvents(node),
    });
    this.finReg.register(node, id);
  }

  static async handleMutation(m: MutationRecord) {
    const targetId = NodeRegistry.getId(m.target);

    switch (m.type) {
      case "attributes":
        console.log(m);
        parentIpc.post({
          type: "changeAttribute",
          data: {
            target: targetId,
            name: m.attributeName!,
            namespace: m.attributeNamespace,
            value: (m.target as Element).getAttributeNS(m.attributeNamespace, m.attributeName!),
          },
        });
        break;

      case "childList":
        if (m.addedNodes.length) {
          const ids = await Promise.all(Array.from(m.addedNodes).map(SharedDOM.initOrGet.bind(SharedDOM)));
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
          const ids = await Promise.all(Array.from(m.removedNodes).map(SharedDOM.initOrGet.bind(SharedDOM)));
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
