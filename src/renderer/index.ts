/**
 * Main Cathodique Renderer & Desktop Environment Runtime.
 */

import { CathodiqueModuleLoader } from "./core/loader.js";
import { ensureLockdown } from "./core/ses-env.js";
import type { ModuleLoaderConfig } from "./core/types.js";
import $ from "informa";

export { $ };
export * from "./core/types.js";
export * from "./core/window.js";
export * from "./core/ses-env.js";
export * from "./core/interface.js";
export * from "./core/compartment.js";
export * from "./core/dom-membrane.js";
export * from "./core/loader.js";

export class Cathodique {
  public loader: CathodiqueModuleLoader;
  private config: ModuleLoaderConfig;

  constructor(config: ModuleLoaderConfig = {}) {
    this.config = {
      baseURL: "https://mods.cathodique.de",
      ...config,
    };
    ensureLockdown();
    this.loader = new CathodiqueModuleLoader(this.config);
  }

  public async init(initModuleId = "@cathodique/init"): Promise<unknown> {
    console.log("[Cathodique] Bootstrapping Desktop Environment...");
    return await this.loader.bootstrapInit(initModuleId);
  }

  public async spawn<T>(interfaceName: string, moduleId?: string): Promise<T> {
    return await this.loader.spawn<T>(interfaceName, moduleId);
  }

  public resolve<T>(interfaceName: string): T | undefined {
    return this.loader.resolve<T>(interfaceName);
  }
}

if (typeof window !== "undefined") {
  (window as any).Cathodique = Cathodique;
  (window as any).$ = $;

  const runtime = new Cathodique({
    baseURL: "https://mods.cathodique.de",
    interfaces: {
      "@cathodique/layer-iface": "@cathodique/layerloader",
      "@cathodique/wm-iface": "@cathodique/sample-wm",
      "@cathodique/service-iface": "@cathodique/sample-service",
    },
  });

  (window as any).cathodiqueRuntime = runtime;
  runtime.init("@cathodique/init").catch(console.error);
}

export default Cathodique;
