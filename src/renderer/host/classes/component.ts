import { nanoid } from "../utils/utils.js";
import { wrapValue } from "../utils/wrap.js";
import { BaseModule, LocalModule } from "./module.js";
import { orchestrator } from "./orchestrator.js";
import { OrderedPeer } from "./orderedPeer.js";

export interface ComponentContext {
  module: BaseModule;
}
export type ComponentHandle = {
  module: BaseModule;
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any };

const isComponentSymbol = Symbol();
export class Component extends EventTarget {
  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;

  [x: `$${string}`]: any;

  componentId: string;
  module: LocalModule;

  [isComponentSymbol] = true;
  constructor(module: LocalModule) {
    super();
    this.componentId = nanoid();
    this.module = module;
  }

  async init() {}

  async getDependency(dependency: string) {
    const newMod = await orchestrator.load(dependency);
    return newMod?.localHandle;
  }
  async getAllDependency(dependency: string) {
    const newMod = await orchestrator.loadAll(dependency);
    return newMod?.map((v) => v.localHandle);
  }
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
  emit(eventName: string, args: any[]) {
    const wrapped = args.map((v) => wrapValue(v))

    const innerSet = this.#listenersFromRemote.get(eventName);
    if (!innerSet) return;
    for (const peer of innerSet) {
      peer.rpc("emitEvent", {
        componentId: this.componentId,
        eventName: eventName,
        args: wrapped,
      });
    }
  }
};
