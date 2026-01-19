import { parentIpc } from "../parentIpc.js";
import { RemoteModule } from "./module.js";
import z from "zod";

export class Resolver {
  static async getDependencyModule(dependency: string) {
    const result = await parentIpc.rpc("getDependency", { dependency });
    const value = z.object({
      port: z.instanceof(MessagePort).optional(),
      id: z.string(),
    }).parse(result);

    return await RemoteModule.getOrCreate(value.port, value.id);
  }
  static async getDependency(dependency: string) {
    return (await this.getDependencyModule(dependency)).localHandle;
  }
  static async getModuleByToken(opaqueToken: string) {
    const result = await parentIpc.rpc("getModuleByToken", { opaqueToken });
    const value = z.object({
      port: z.instanceof(MessagePort).optional(),
      id: z.string(),
    }).parse(result);

    return await RemoteModule.getOrCreate(value.port, value.id);
  }
  static async getByToken(token: string) {
    return (await this.getModuleByToken(token)).localHandle;
  }
  static async summon(id: string, args: any[] = []) {
    if (id.split('.').length !== 2) throw new Error("Malformed component identifier");
    const [schema, component] = id.split('.');

    return (await this.getDependency(schema)).get(component).create(...args);
  }

  static async getAllDependency(dependency: string) {
    const result = await parentIpc.rpc("getAllDependency", { dependency });
    const handles = z.array(z.object({
      port: z.instanceof(MessagePort).optional(),
      id: z.string(),
    })).parse(result);
    return await Promise.all(
      handles.map(
        async (handle) =>
          (await RemoteModule.getOrCreate(handle.port, handle.id))
            .localHandle
      )
    );
  }
  static async summonAll(id: string, args: any[] = []) {
    if (id.split('.').length !== 2) throw new Error("Malformed component identifier");
    const [schema, component] = id.split('.');

    return (await this.getDependency(schema)).get(component).create(args);
  }
}
