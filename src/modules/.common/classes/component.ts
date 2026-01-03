import { parentIpc } from "../parentIpc.js";
import { nanoid } from "../utils/utils.js";
import { RemoteModule } from "./module.js";
import { OrderedPeer } from "./orderedPeer.js";
import z from "zod";

export interface ComponentContext {
  ipc: OrderedPeer;
}
export type ComponentHandle = {
  ipc: OrderedPeer;
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any; };

const isComponentSymbol = Symbol();
export abstract class Component extends EventTarget {
  [k: `$${string}`]: any;

  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;
  componentId: string;
  ipc: OrderedPeer;

  [isComponentSymbol] = true;
  constructor(ctx: ComponentContext) {
    super();
    this.ipc = ctx.ipc;
    this.componentId = nanoid();
  }

  abstract init(): any;

  post(obj: Record<string, any>) {
    return this.ipc.post({ ...obj, componentHandle: this.componentId });
  }
  rpc(type: string, data: Record<string, any>, obj: Record<string, any> = {}) {
    return this.ipc.rpc(type, data, { ...obj, componentHandle: this.componentId });
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
}
