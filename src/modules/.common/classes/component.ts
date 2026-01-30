import { EventEmitter } from "events";
import { componentTypes } from "../utils/types.js";
import { nanoid } from "../utils/utils.js";
import { wrapValue } from "../utils/wrap.js";
import { componentList } from "./componentList.js";
import { OrderedPeer } from "./orderedPeer.js";

export type ComponentHandle = {
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any; };

const isComponentSymbol = Symbol();
export abstract class Component implements ComponentHandle {
  [k: `$${string}`]: any;

  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;
  componentId: string;

  static type: typeof componentTypes[number] = "NORMAL";

  [isComponentSymbol] = true;
  constructor() {
    this.componentId = nanoid();

    componentList.componentInstances.set(
      this.componentId,
      this,
    );
  }

  init(): any {}

  #listenersFromRemote = new Map<string, Set<OrderedPeer>>();
  listenFor(eventName: string, peer: OrderedPeer) {
    const innerSet = this.#listenersFromRemote.get(eventName) || new Set();
    if (!this.#listenersFromRemote.has(eventName)) this.#listenersFromRemote.set(eventName, innerSet);

    innerSet.add(peer);
  }
  unlistenFor(eventName: string, peer: OrderedPeer) {
    const innerSet = this.#listenersFromRemote.get(eventName) || new Set();

    innerSet.delete(peer);

    if (innerSet.size === 0) this.#listenersFromRemote.delete(eventName);
  }
  emit(eventName: string, ...args: any[]) {
    const wrapped = args.map((v) => wrapValue(v))

    const innerSet = this.#listenersFromRemote.get(eventName);
    if (!innerSet) return false;

    Promise.all(
      [...innerSet]
        .map((peer) =>
          peer.rpc("emitEvent", {
            componentId: this.componentId,
            eventName: eventName,
            args: wrapped,
          })
        ),
    );
    return true;
  }
}
