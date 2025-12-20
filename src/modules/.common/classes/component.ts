import { nanoid } from "../utils/utils.js";
import { parentIpc } from "../parentIpc.js";

export class Component extends EventTarget {
  componentHandle: string;

  constructor() {
    super();
    const handle = nanoid();
    this.componentHandle = handle;
  }

  init() {}

  post(obj: Record<string, any>) {
    return parentIpc.post({ ...obj, componentHandle: this.componentHandle });
  }
  rpc(type: string, data: Record<string, any>, obj: Record<string, any> = {}) {
    return parentIpc.rpc(type, data, { ...obj, componentHandle: this.componentHandle });
  }

  async getDependency(dependency: string) {
    return await this.rpc("getDependency", { dependency });
  }
  async getOptionalDependency(dependency: string) {
    return await this.rpc("getOptionalDependency", { dependency });
  }
  async getAllDependency(dependency: string) {
    return await this.rpc("getAllDependency", { dependency });
  }
}
