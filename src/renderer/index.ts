/**
 * Main Cathodique Renderer & Desktop Environment Runtime.
 */

import { CathodiqueModuleLoader } from "./core/loader.js";
import { ensureLockdown } from "./core/ses-env.js";
import type { ModuleLoaderConfig, InitModuleContext } from "./core/types.js";
import { DmabufBridgeClient } from "./dmabuf-client.js";
import $ from "informa";

export { $, DmabufBridgeClient };
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

  public async init(initModuleId: string = "@cathodique/init", ctx?: Partial<InitModuleContext>): Promise<unknown> {
    console.log("[Cathodique] Bootstrapping Desktop Environment...");
    return await this.loader.bootstrapInit(initModuleId, {
      DmabufBridgeClient,
      ...ctx,
    });
  }

  public async spawn<T>(moduleId: string, ...args: any[]): Promise<T> {
    return await this.loader.spawn<T>(moduleId, ...args);
  }

  public resolve<T>(moduleId: string): T | undefined {
    return this.loader.resolve<T>(moduleId);
  }
}

(window as any).Cathodique = Cathodique;
(window as any).$ = $;

const runtime = new Cathodique({
  baseURL: "https://mods.cathodique.de",
});

(window as any).cathodiqueRuntime = runtime;

async function bootstrap() {
  let iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe && document.readyState === "loading") {
    await new Promise((resolve) => window.addEventListener("DOMContentLoaded", resolve, { once: true }));
    iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
  }
  await runtime.init("@cathodique/init", {
    iframeElement: iframe ?? undefined,
    DmabufBridgeClient,
  });
}

bootstrap().catch(console.error);

export default Cathodique;
