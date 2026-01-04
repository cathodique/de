import { parentIpc } from "../parentIpc.js";
import { nanoid } from "../utils/utils.js";
import { wrapValue } from "../utils/wrap.js";
import { RemoteModule } from "./module.js";
import { OrderedPeer } from "./orderedPeer.js";
import z from "zod";

export interface ComponentContext {
  peer: OrderedPeer;
}
export type ComponentHandle = {
  peer: OrderedPeer;
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any; };

const isComponentSymbol = Symbol();
export abstract class Component extends EventTarget {
  [k: `$${string}`]: any;

  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;
  componentId: string;
  peer: OrderedPeer;

  [isComponentSymbol] = true;
  constructor(ctx: ComponentContext) {
    super();
    this.peer = ctx.peer;
    this.componentId = nanoid();
  }

  abstract init(): any;

  post(obj: Record<string, any>) {
    return this.peer.post({ ...obj, componentHandle: this.componentId });
  }
  rpc(type: string, data: Record<string, any>, obj: Record<string, any> = {}) {
    return this.peer.rpc(type, data, { ...obj, componentHandle: this.componentId });
  }

  async #getDependencyRpc(dependency: string) {
    const result = await parentIpc.rpc("getDependency", { dependency });
    return z.object({
      port: z.instanceof(MessagePort),
      id: z.string(),
    }).parse(result);
  }
  async getDependency(dependency: string) {
    const v = await this.#getDependencyRpc(dependency);
    const remoteModule = RemoteModule.getOrCreate(v.port, v.id);
    return remoteModule.localHandle;
  }

  async #getAllDependencyRpc(dependency: string) {
    const result = await parentIpc.rpc("getAllDependency", { dependency });
    return z.array(z.object({
      port: z.instanceof(MessagePort),
      id: z.string(),
    })).parse(result);
  }
  async getAllDependency(dependency: string) {
    const handles = await this.#getAllDependencyRpc(dependency);
    return handles.map((v) => RemoteModule.getOrCreate(v.port, v.id).localHandle);
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
  async emit(eventName: string, args: any[]) {
    const wrapped = args.map((v) => wrapValue(v))

    const innerSet = this.#listenersFromRemote.get(eventName);
    if (!innerSet) return;

    await Promise.all(
      [...innerSet]
        .map((peer) =>
          peer.rpc("emitEvent", {
            componentId: this.componentId,
            eventName: eventName,
            args: wrapped,
          })
        ),
    );
  }
}
