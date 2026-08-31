/**
 * Flexible Module Loader and Registry for Cathodique.
 * Manages SES Compartments, Endo ModuleSource evaluation, DOM capability granting, and interface instantiation.
 */

import { compileModuleSource, ensureLockdown } from "./ses-env.js";
import { createModuleCompartment } from "./compartment.js";
import { DomMembrane } from "./dom-membrane.js";
import { defineInterface, getInterface, listInterfaces, validateModuleExports } from "./interface.js";
import $ from "informa";
import type {
  InitModuleContext,
  InterfaceDefinition,
  ModuleInstance,
  ModuleLoaderApi,
  ModuleLoaderConfig,
  ModuleMetadata,
  ModuleRecord,
} from "./types.js";

export function normalizeScopedId(value: string, namespace = "@cathodique"): string {
  if (!value || value.startsWith("@") || value.startsWith(".") || value.startsWith("/") || value.includes("://")) {
    return value;
  }
  const root = namespace.startsWith("@") ? namespace : `@${namespace}`;
  return `${root}/${value.replace(/^\/+/, "")}`;
}

export class CathodiqueModuleLoader implements ModuleLoaderApi {
  private config: ModuleLoaderConfig;
  private namespace: string;
  private baseURL: string;
  private cdnURL: string;

  private interfaces = new Map<string, InterfaceDefinition<any>>();
  private moduleRecords = new Map<string, ModuleRecord>();
  private moduleInstances = new Map<string, ModuleInstance<any>>();
  private interfaceMappings = new Map<string, string>();
  private hostModules = new Map<string, any>();
  private membrane: DomMembrane;

  constructor(config: ModuleLoaderConfig = {}) {
    this.config = config;
    this.namespace = config.namespace ?? "@cathodique";
    this.baseURL = (config.baseURL ?? "").replace(/\/$/, "");
    this.cdnURL = config.cdnURL ?? "https://esm.sh";
    this.membrane = DomMembrane.getInstance();

    ensureLockdown();

    // Register built-in host modules
    this.hostModules.set("informa", { default: $, ...$ });

    for (const iface of listInterfaces()) {
      this.interfaces.set(iface.name, iface);
    }

    // Default built-in implementation mappings
    const defaultMappings: Record<string, string> = {
      "@cathodique/layer-iface": "@cathodique/layerloader",
      "@cathodique/wm-iface": "@cathodique/sample-wm",
      "@cathodique/service-iface": "@cathodique/sample-service",
      "@cathodique/init-iface": "@cathodique/init",
    };
    for (const [k, v] of Object.entries(defaultMappings)) {
      this.interfaceMappings.set(normalizeScopedId(k, this.namespace), normalizeScopedId(v, this.namespace));
    }

    if (config.interfaces) {
      for (const [k, v] of Object.entries(config.interfaces)) {
        this.interfaceMappings.set(normalizeScopedId(k, this.namespace), normalizeScopedId(v, this.namespace));
      }
    }

    if (config.hostModules) {
      for (const [k, v] of Object.entries(config.hostModules)) {
        this.hostModules.set(k, v);
      }
    }
  }

  public registerInterface<T>(definition: InterfaceDefinition<T>): void {
    const norm = normalizeScopedId(definition.name, this.namespace);
    const def = { ...definition, name: norm };
    defineInterface(def);
    this.interfaces.set(norm, def);
  }

  public getInterface<T>(name: string): InterfaceDefinition<T> | undefined {
    const norm = normalizeScopedId(name, this.namespace);
    return (this.interfaces.get(norm) ?? getInterface(norm)) as InterfaceDefinition<T> | undefined;
  }

  public listRegisteredInterfaces(): InterfaceDefinition<any>[] {
    return Array.from(this.interfaces.values());
  }

  public registerModule(record: ModuleRecord): void {
    const norm = normalizeScopedId(record.id, this.namespace);
    this.moduleRecords.set(norm, { ...record, id: norm });
  }

  public registerHostModule(specifier: string, exportsNamespace: Record<string, unknown>): void {
    this.hostModules.set(specifier, exportsNamespace);
  }

  public async loadManifest(moduleId: string): Promise<ModuleMetadata | null> {
    const norm = normalizeScopedId(moduleId, this.namespace);
    let scope = "cathodique";
    let name = norm;
    if (norm.startsWith("@")) {
      const parts = norm.slice(1).split("/");
      scope = parts[0];
      name = parts.slice(1).join("/");
    }

    const candidateUrls = [
      `${this.baseURL}/@${scope}/${name}/manifest.json`,
      `${this.baseURL}/modules/${scope}/${name}/manifest.json`,
      `${this.baseURL}/api/metadata/${norm}`,
      `./modules/${scope}/${name}/manifest.json`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch {}
    }

    if (typeof require !== "undefined") {
      try {
        const fs = require("node:fs");
        const path = require("node:path");
        const paths = [
          path.resolve(process.cwd(), "dist/renderer/modules", scope, name, "manifest.json"),
          path.resolve(process.cwd(), "src/renderer/modules", scope, name, "manifest.json"),
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
        }
      } catch {}
    }

    return null;
  }

  public async loadInterface<T = unknown>(interfaceId: string): Promise<InterfaceDefinition<T>> {
    const norm = normalizeScopedId(interfaceId, this.namespace);
    if (this.interfaces.has(norm)) return this.interfaces.get(norm) as InterfaceDefinition<T>;

    const manifest = await this.loadManifest(norm);
    if (manifest?.exportMap) {
      const def = defineInterface<T>({
        name: norm,
        type: "interface",
        exportMap: manifest.exportMap,
        description: manifest.description,
        version: manifest.version,
      });
      this.registerInterface(def);
      return def;
    }

    const mod = await this.loadModule<any>(norm);
    const exp = mod.exports;
    const def = (exp.default && typeof exp.default === "object" && "exportMap" in exp.default)
      ? (exp.default as InterfaceDefinition<T>)
      : defineInterface<T>({
          name: norm,
          exportMap: (exp.exportMap ?? {}) as any,
        });

    this.registerInterface(def);
    return def;
  }

  public async discoverImplementingModules(interfaceName: string): Promise<ModuleMetadata[]> {
    const norm = normalizeScopedId(interfaceName, this.namespace);
    const results: ModuleMetadata[] = [];

    // 1. In-memory records
    for (const rec of this.moduleRecords.values()) {
      if (rec.interfaceName === norm || rec.metadata?.interface === norm || rec.metadata?.interfaceName === norm) {
        results.push({ id: rec.id, ...rec.metadata });
      }
    }

    // 2. Fetch catalog index
    if (this.baseURL) {
      try {
        const res = await fetch(`${this.baseURL}/index.json`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.modules)) {
            for (const mod of data.modules) {
              if (mod.interface === norm || mod.interfaceName === norm || (Array.isArray(mod.implements) && mod.implements.includes(norm))) {
                if (!results.some((r) => r.id === mod.id)) results.push(mod);
              }
            }
          }
        }
      } catch {}
    }

    return results;
  }

  public resolveModuleId(interfaceName: string, preferredModuleId?: string): string {
    const norm = normalizeScopedId(interfaceName, this.namespace);
    if (preferredModuleId) return normalizeScopedId(preferredModuleId, this.namespace);
    if (this.interfaceMappings.has(norm)) return this.interfaceMappings.get(norm)!;
    return norm;
  }

  private async fetchSource(moduleId: string): Promise<{ code: string; url: string }> {
    const recorded = this.moduleRecords.get(moduleId);
    if (recorded?.sourceCode) {
      return { code: recorded.sourceCode, url: recorded.sourceUrl ?? `${moduleId}.js` };
    }

    let scope = "cathodique";
    let name = moduleId;
    if (moduleId.startsWith("@")) {
      const parts = moduleId.slice(1).split("/");
      scope = parts[0];
      name = parts.slice(1).join("/");
    }

    const candidateUrls = [
      `${this.baseURL}/@${scope}/${name}.js`,
      `${this.baseURL}/@${scope}/${name}`,
      `${this.baseURL}/modules/${scope}/${name}/index.js`,
      `${this.baseURL}/modules/${scope}/${name}.js`,
      `./modules/${scope}/${name}/index.js`,
      `./modules/${scope}/${name}.js`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) return { code: await res.text(), url };
      } catch {}
    }

    if (typeof require !== "undefined") {
      try {
        const fs = require("node:fs");
        const path = require("node:path");
        const paths = [
          path.resolve(process.cwd(), "dist/renderer/modules", scope, name, "index.js"),
          path.resolve(process.cwd(), "dist/renderer/modules", scope, `${name}.js`),
          path.resolve(process.cwd(), "dist/renderer", `${name}.js`),
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) return { code: fs.readFileSync(p, "utf-8"), url: `file://${p}` };
        }
      } catch {}
    }

    throw new Error(`Unable to fetch source for module '${moduleId}'.`);
  }

  public async loadModule<T = unknown>(
    moduleId: string,
    options: { isInit?: boolean; interfaceName?: string } = {}
  ): Promise<ModuleInstance<T>> {
    const norm = normalizeScopedId(moduleId, this.namespace);
    if (this.moduleInstances.has(norm)) {
      return this.moduleInstances.get(norm) as ModuleInstance<T>;
    }

    // Check host module map
    if (this.hostModules.has(norm)) {
      const hostExports = this.hostModules.get(norm);
      const compartment = createModuleCompartment({ name: norm, isInit: options.isInit });
      const instance: ModuleInstance<T> = {
        id: norm,
        interfaceName: options.interfaceName,
        compartment,
        exports: hostExports,
        instance: (hostExports.default ?? hostExports) as T,
      };
      this.moduleInstances.set(norm, instance);
      return instance;
    }

    const isInit = options.isInit ?? (norm === normalizeScopedId(this.config.initModule ?? "init", this.namespace));
    const { code, url } = await this.fetchSource(norm);
    const manifest = await this.loadManifest(norm);

    // Grant proxied document if module requests DOM capabilities
    let proxiedDocument: Document | undefined = undefined;
    const caps = manifest?.capabilities ?? [];
    if (caps.includes("dom:export") || caps.includes("dom:render") || caps.includes("dom") || isInit) {
      proxiedDocument = this.membrane.createDocumentProxy(norm);
    }

    const moduleExports: Record<string, unknown> = {};
    const moduleObj = { exports: moduleExports };

    const compartment = createModuleCompartment({
      name: norm,
      isInit,
      endowments: {
        exports: moduleExports,
        module: moduleObj,
        ...(proxiedDocument ? { document: proxiedDocument } : {}),
        ...this.config.defaultEndowments,
      },
      resolveHook: (specifier: string) => normalizeScopedId(specifier, this.namespace),
      importHook: async (specifier: string) => {
        const resolved = normalizeScopedId(specifier, this.namespace);
        if (this.hostModules.has(resolved)) {
          return { namespace: this.hostModules.get(resolved) } as any;
        }
        const src = await this.fetchSource(resolved);
        return await compileModuleSource(src.code, src.url, `${this.cdnURL}/@endo/module-source`);
      },
    });

    let exportsNamespace: Record<string, unknown> = {};
    try {
      compartment.evaluate(code);
      exportsNamespace = Object.keys(moduleObj.exports).length > 0 ? moduleObj.exports : moduleExports;
    } catch (err: any) {
      throw new Error(`Failed evaluating module '${norm}': ${err?.message ?? err}`);
    }

    // Validate interface contract
    const targetIface = options.interfaceName ?? (manifest?.interface ? normalizeScopedId(manifest.interface, this.namespace) : undefined);
    if (targetIface) {
      const iface = this.getInterface(targetIface);
      if (iface) {
        const val = validateModuleExports(exportsNamespace, iface);
        if (!val.valid) {
          throw new Error(`Module '${norm}' fails contract for '${targetIface}': ${val.errors.join(", ")}`);
        }
      }
    }

    const instance: ModuleInstance<T> = {
      id: norm,
      interfaceName: targetIface,
      compartment,
      exports: exportsNamespace,
      instance: (exportsNamespace.default ?? exportsNamespace) as T,
      metadata: manifest ?? undefined,
      proxiedDocument,
    };

    this.moduleInstances.set(norm, instance);
    return instance;
  }

  public async spawn<T = unknown>(interfaceName: string, moduleId?: string): Promise<T> {
    const normIface = normalizeScopedId(interfaceName, this.namespace);
    const targetMod = moduleId ? normalizeScopedId(moduleId, this.namespace) : this.resolveModuleId(normIface);
    const cacheKey = `${normIface}::${targetMod}`;

    if (this.moduleInstances.has(cacheKey)) {
      return this.moduleInstances.get(cacheKey)!.instance as T;
    }

    const handle = await this.loadModule<T>(targetMod, { interfaceName: normIface });
    let inst: any = handle.instance;

    if (typeof handle.exports.default === "function" && (handle.exports.default as any).prototype?.constructor === handle.exports.default) {
      const Cls = handle.exports.default as new () => T;
      inst = new Cls();
    } else if (typeof handle.exports.create === "function") {
      inst = (handle.exports.create as Function)();
    }

    handle.instance = inst;
    this.moduleInstances.set(cacheKey, handle);
    this.moduleInstances.set(normIface, handle);
    return inst as T;
  }

  public resolve<T = unknown>(interfaceName: string): T | undefined {
    const norm = normalizeScopedId(interfaceName, this.namespace);
    return (this.moduleInstances.get(norm)?.instance ?? this.moduleInstances.get(this.resolveModuleId(norm))?.instance) as T | undefined;
  }

  public async bootstrapInit(initModuleId = "init"): Promise<unknown> {
    const norm = normalizeScopedId(initModuleId, this.namespace);

    let iframeElement: HTMLIFrameElement | undefined = undefined;
    if (typeof document !== "undefined") {
      iframeElement = (document.querySelector("iframe") as HTMLIFrameElement) ?? undefined;
    }

    const initHandle = await this.loadModule<any>(norm, { isInit: true, interfaceName: "@cathodique/init-iface" });
    const initFn = typeof initHandle.exports.init === "function"
      ? initHandle.exports.init
      : typeof initHandle.exports.default === "function"
      ? initHandle.exports.default
      : null;

    if (!initFn) throw new Error(`Init module '${norm}' must export an 'init' function.`);

    const context: InitModuleContext = {
      globalThis: globalThis,
      require: typeof require !== "undefined" ? require : undefined,
      $: $,
      config: this.config,
      loader: this,
      iframeElement,
      membrane: this.membrane,
    };

    return await initFn(context);
  }
}
