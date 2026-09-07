/**
 * Core Dynamic Module Loader for Cathodique Desktop Environment.
 * Implements one-way capability orchestration, isolated Compartments,
 * manifest contract verification, and interface enforcement.
 */

import $ from "informa";
import { createModuleCompartment } from "./compartment.js";
import { DomMembrane } from "./dom-membrane.js";
import type {
  ModuleLoaderApi,
  ModuleLoaderConfig,
  ModuleMetadata,
  ModuleRecord,
  ModuleInstance,
  InitModuleContext,
} from "./types.js";

export type PrivilegedRequire = (specifier: string) => any;

function parseModuleSpecifier(specifier: string, defaultNamespace = "cathodique"): {
  scope: string;
  packageName: string;
  subpath: string;
} {
  let clean = specifier.trim();
  let subpath = ".";

  if (clean.startsWith("@")) {
    const slashIdx = clean.indexOf("/");
    if (slashIdx === -1) throw new Error(`Invalid scoped module specifier: ${specifier}`);
    const scope = clean.slice(1, slashIdx);
    const rest = clean.slice(slashIdx + 1);
    const subSlash = rest.indexOf("/");
    if (subSlash === -1) {
      return { scope, packageName: rest, subpath: "." };
    }
    return {
      scope,
      packageName: rest.slice(0, subSlash),
      subpath: rest.slice(subSlash + 1),
    };
  }

  if (clean.startsWith("modules/")) {
    const parts = clean.replace(/^modules\//, "").split("/");
    const scope = parts[0];
    const packageName = parts[1] ?? "";
    const sub = parts.slice(2).join("/");
    return { scope, packageName, subpath: sub || "." };
  }

  const slashIdx = clean.indexOf("/");
  if (slashIdx === -1) {
    return { scope: defaultNamespace, packageName: clean, subpath: "." };
  }
  return {
    scope: defaultNamespace,
    packageName: clean.slice(0, slashIdx),
    subpath: clean.slice(slashIdx + 1),
  };
}

function normalizeScopedId(specifier: string, defaultNamespace = "cathodique"): string {
  const { scope, packageName, subpath } = parseModuleSpecifier(specifier, defaultNamespace);
  const base = `@${scope}/${packageName}`;
  return subpath === "." ? base : `${base}/${subpath}`;
}

export class CathodiqueModuleLoader implements ModuleLoaderApi {
  private baseURL: string;
  private namespace: string;
  private config: ModuleLoaderConfig;
  private membrane: DomMembrane;

  private moduleRecords = new Map<string, ModuleRecord>();
  private moduleInstances = new Map<string, ModuleInstance<any>>();
  private hostModules = new Map<string, any>();
  private initModuleLoaded = false;

  constructor(config: ModuleLoaderConfig = {}) {
    this.config = config;
    this.baseURL = (config.baseURL ?? "https://mods.cathodique.de").replace(/\/+$/, "");
    this.namespace = config.namespace ?? "cathodique";
    this.membrane = DomMembrane.getInstance();

    this.registerHostModule("informa", $);
    this.registerHostModule("@cathodique/informa", $);
  }

  public registerModule(record: ModuleRecord): void {
    const norm = normalizeScopedId(record.id, this.namespace);
    this.moduleRecords.set(norm, record);
  }

  public registerHostModule(moduleId: string, exports: any): void {
    const norm = normalizeScopedId(moduleId, this.namespace);
    this.hostModules.set(norm, exports);
    this.hostModules.set(moduleId, exports);
  }

  public recordModule(
    moduleId: string,
    options: { manifest?: ModuleMetadata; sourceCode?: string; sourceUrl?: string }
  ): void {
    const norm = normalizeScopedId(moduleId, this.namespace);
    this.moduleRecords.set(norm, {
      id: norm,
      sourceCode: options.sourceCode,
      sourceUrl: options.sourceUrl,
      metadata: options.manifest,
    });
  }

  public async loadManifest(moduleId: string): Promise<ModuleMetadata | null> {
    return this.fetchManifest(moduleId);
  }

  public async fetchManifest(moduleId: string): Promise<ModuleMetadata | null> {
    const norm = normalizeScopedId(moduleId, this.namespace);
    const { scope, packageName } = parseModuleSpecifier(norm, this.namespace);

    const recorded = this.moduleRecords.get(norm);
    if (recorded?.metadata) return recorded.metadata;

    const candidateUrls = [
      `${this.baseURL}/@${scope}/${packageName}/manifest.json`,
      `${this.baseURL}/modules/${scope}/${packageName}/manifest.json`,
      `./modules/${scope}/${packageName}/manifest.json`,
    ];

    for (const url of candidateUrls) {
      const res = await fetch(url).catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        return json as ModuleMetadata;
      }
    }

    if (typeof require !== "undefined") {
      const fs = require("node:fs");
      const path = require("node:path");
      const paths = [
        path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, "manifest.json"),
        path.resolve(process.cwd(), "src/renderer/modules", scope, packageName, "manifest.json"),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
      }
    }

    return null;
  }

  public resolveModuleId(moduleId: string): string {
    return normalizeScopedId(moduleId, this.namespace);
  }

  public resolve<T = unknown>(moduleId: string): T | undefined {
    const norm = normalizeScopedId(moduleId, this.namespace);
    return this.moduleInstances.get(norm)?.instance as T | undefined;
  }

  public getSubpathInterfaces(manifest: ModuleMetadata | null, subpath: string): string[] {
    if (!manifest) return [];

    const interfaces: string[] = [];

    if (manifest.exports) {
      const entry = manifest.exports[subpath] ?? (subpath === "." ? manifest.exports["."] : undefined);
      if (entry && typeof entry === "object" && entry.implements) {
        if (Array.isArray(entry.implements)) {
          interfaces.push(...entry.implements);
        } else if (typeof entry.implements === "string") {
          interfaces.push(entry.implements);
        }
      }
    }

    if (manifest.implements) {
      if (typeof manifest.implements === "string") {
        if (subpath === "." || interfaces.length === 0) interfaces.push(manifest.implements);
      } else if (Array.isArray(manifest.implements)) {
        if (subpath === "." || interfaces.length === 0) interfaces.push(...manifest.implements);
      } else if (typeof manifest.implements === "object") {
        const pathIface = manifest.implements[subpath] ?? (manifest.implements as any)[subpath.replace(/^\.\//, "")];
        if (pathIface) {
          if (Array.isArray(pathIface)) interfaces.push(...pathIface);
          else interfaces.push(pathIface);
        }
      }
    }

    if (manifest.interface && interfaces.length === 0 && subpath === ".") {
      interfaces.push(manifest.interface);
    }

    return interfaces;
  }

  private async fetchSource(moduleId: string, manifest?: ModuleMetadata | null): Promise<{ code: string; url: string }> {
    const norm = normalizeScopedId(moduleId, this.namespace);
    const recorded = this.moduleRecords.get(norm);
    if (recorded?.sourceCode) {
      return { code: recorded.sourceCode, url: recorded.sourceUrl ?? `${norm}.js` };
    }

    const { scope, packageName, subpath } = parseModuleSpecifier(norm, this.namespace);

    let targetRelativeFile: string | undefined = undefined;
    if (manifest?.exports && manifest.exports[subpath]) {
      const entry = manifest.exports[subpath];
      if (typeof entry === "string") targetRelativeFile = entry;
      else if (typeof entry === "object" && entry.import) targetRelativeFile = entry.import;
    }

    const fileBase = targetRelativeFile
      ? targetRelativeFile.replace(/^\.\//, "")
      : (subpath === "." ? "index.js" : `${subpath.replace(/^\.\//, "")}.js`);

    const candidateUrls = [
      `${this.baseURL}/@${scope}/${packageName}/${fileBase}`,
      `${this.baseURL}/modules/${scope}/${packageName}/${fileBase}`,
      `./modules/${scope}/${packageName}/${fileBase}`,
      `${this.baseURL}/@${scope}/${packageName}/${fileBase.replace(/\.js$/, "")}/index.js`,
      `${this.baseURL}/modules/${scope}/${packageName}/${fileBase.replace(/\.js$/, "")}/index.js`,
    ];

    for (const url of candidateUrls) {
      const res = await fetch(url).catch(() => null);
      if (res && res.ok) return { code: await res.text(), url };
    }

    if (typeof require !== "undefined") {
      const fs = require("node:fs");
      const path = require("node:path");
      const relWithoutExt = fileBase.replace(/\.js$/, "");
      const paths = [
        path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, fileBase),
        path.resolve(process.cwd(), "src/renderer/modules", scope, packageName, `${relWithoutExt}.ts`),
        path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, relWithoutExt, "index.js"),
        path.resolve(process.cwd(), "src/renderer/modules", scope, packageName, relWithoutExt, "index.ts"),
        path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, "index.js"),
        path.resolve(process.cwd(), "src/renderer/modules", scope, packageName, "index.ts"),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return { code: fs.readFileSync(p, "utf-8"), url: p };
      }
    }

    throw new Error(`Module source not found for: ${norm} (subpath: ${subpath})`);
  }

  public loadModuleSync(moduleId: string, callerCaps: string[] = [], isCallerInit = false): Record<string, unknown> {
    const norm = normalizeScopedId(moduleId, this.namespace);

    // Capability security gate
    if (norm === "@cathodique/dmabuf-client" || norm === "dmabuf-client") {
      const hasDmabufCap = isCallerInit || callerCaps.some((c) => c === "dmabuf" || c === "cap-dmabuf" || c === "host");
      if (!hasDmabufCap) {
        throw new Error(`[Security / SES] Access denied: Module does not possess the 'dmabuf' capability required to require('${norm}').`);
      }
    }

    if (this.moduleInstances.has(norm)) {
      return this.moduleInstances.get(norm)!.exports;
    }
    if (this.hostModules.has(norm)) {
      return this.hostModules.get(norm)!;
    }

    if (typeof require === "undefined") {
      throw new Error(`Synchronous module loading not supported in browser environment without preloading: ${norm}`);
    }

    const fs = require("node:fs");
    const path = require("node:path");
    const { scope, packageName, subpath } = parseModuleSpecifier(norm, this.namespace);
    const subpathFile = subpath === "." ? "index.js" : `${subpath.replace(/^\.\//, "")}.js`;

    const candidatePaths = [
      path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, subpathFile),
      path.resolve(process.cwd(), "dist/renderer/modules", scope, packageName, "index.js"),
      path.resolve(process.cwd(), "src/renderer/modules", scope, packageName, "index.js"),
    ];

    let targetPath: string | undefined;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        targetPath = p;
        break;
      }
    }

    if (!targetPath) {
      return require(moduleId);
    }

    const code = fs.readFileSync(targetPath, "utf-8");
    const moduleExports: Record<string, unknown> = {};
    const moduleObj = { exports: moduleExports };

    const isSubInit = norm.endsWith("/init");
    const isSubInterface = norm.endsWith("-iface");

    let manifestCaps: string[] = [];
    const manifestPath = path.resolve(path.dirname(targetPath), "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifestCaps = manifestContent.capabilities ?? manifestContent.manifest?.capabilities ?? [];
      } catch {}
    }
    const combinedCaps = Array.from(new Set([...callerCaps, ...manifestCaps]));

    let proxiedDocument: Document | undefined = undefined;
    let proxiedWindow: Window | undefined = undefined;

    if (typeof document !== "undefined") {
      proxiedDocument = this.membrane.createDocumentProxy(norm);
    }
    if (typeof window !== "undefined") {
      proxiedWindow = this.membrane.wrap(window, "host", norm);
    }

    const reqFn = (spec: string) => this.loadModuleSync(spec, combinedCaps, isCallerInit);

    const compartment = createModuleCompartment({
      name: norm,
      isInit: isSubInit,
      isInterface: isSubInterface,
      capabilities: combinedCaps,
      endowments: {
        require: reqFn,
        exports: moduleExports,
        module: moduleObj,
        ...(proxiedDocument ? { document: proxiedDocument } : {}),
        ...(proxiedWindow ? { window: proxiedWindow } : {}),
        ...this.config.defaultEndowments,
      },
    });

    const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${code}\n})\n//# sourceURL=${targetPath}`;
    const runner = compartment.evaluate(wrapped);
    runner(moduleExports, reqFn, moduleObj, targetPath, path.dirname(targetPath));

    const exportsNamespace = Object.keys(moduleObj.exports).length > 0 ? moduleObj.exports : moduleExports;

    const instance: ModuleInstance<any> = {
      id: norm,
      compartment,
      exports: exportsNamespace,
      instance: (exportsNamespace.default ?? exportsNamespace),
      proxiedDocument,
    };

    this.moduleInstances.set(norm, instance);
    return exportsNamespace;
  }

  public async loadModule<T = Record<string, unknown>>(
    moduleId: string,
    capabilitiesOrOptions?: string[] | { isInit?: boolean; capabilities?: string[] }
  ): Promise<ModuleInstance<T>> {
    const norm = normalizeScopedId(moduleId, this.namespace);
    const { subpath } = parseModuleSpecifier(norm, this.namespace);

    if (this.moduleInstances.has(norm)) {
      return this.moduleInstances.get(norm) as ModuleInstance<T>;
    }

    const manifest = await this.fetchManifest(norm);
    const { code, url } = await this.fetchSource(norm, manifest);

    const isInit = norm === "@cathodique/init" || norm.endsWith("/init");
    const isInterface = norm.endsWith("-iface");

    const passedCaps = Array.isArray(capabilitiesOrOptions)
      ? capabilitiesOrOptions
      : (capabilitiesOrOptions?.capabilities ?? []);
    const manifestCaps = (manifest as any)?.capabilities ?? (manifest as any)?.manifest?.capabilities ?? [];
    const caps = Array.from(new Set([...passedCaps, ...manifestCaps]));

    const moduleExports: Record<string, unknown> = {};
    const moduleObj = { exports: moduleExports };

    let proxiedDocument: Document | undefined = undefined;
    let proxiedWindow: Window | undefined = undefined;

    if (typeof document !== "undefined") {
      proxiedDocument = this.membrane.createDocumentProxy(norm);
    }
    if (typeof window !== "undefined") {
      proxiedWindow = this.membrane.wrap(window, "host", norm);
    }

    const privilegedRequire: PrivilegedRequire = (specifier: string) => {
      const normSpec = normalizeScopedId(specifier, this.namespace);

      if (normSpec === "@cathodique/dmabuf-client" || normSpec === "dmabuf-client") {
        const hasDmabufCap = isInit || caps.some((c) => c === "dmabuf" || c === "cap-dmabuf" || c === "host");
        if (!hasDmabufCap) {
          throw new Error(`[Security / SES] Access denied: Module '${norm}' does not possess 'dmabuf' capability required to import '${specifier}'.`);
        }
      }

      if (specifier === "informa") return $;
      if (this.hostModules.has(specifier)) return this.hostModules.get(specifier);
      if (this.hostModules.has(normSpec)) return this.hostModules.get(normSpec);

      return this.loadModuleSync(normSpec, caps, isInit);
    };

    const compartment = createModuleCompartment({
      name: norm,
      isInit,
      isInterface,
      capabilities: caps,
      endowments: {
        exports: moduleExports,
        module: moduleObj,
        require: privilegedRequire,
        ...(proxiedDocument ? { document: proxiedDocument } : {}),
        ...(proxiedWindow ? { window: proxiedWindow } : {}),
        ...this.config.defaultEndowments,
      },
    });

    const wrapped = `(function(exports, require, module) {\n${code}\n})\n//# sourceURL=${url}`;
    const runner = compartment.evaluate(wrapped);
    runner(moduleExports, privilegedRequire, moduleObj);

    const exportsNamespace = Object.keys(moduleObj.exports).length > 0 ? moduleObj.exports : moduleExports;
    const subpathIfaces = this.getSubpathInterfaces(manifest, subpath);

    const instance: ModuleInstance<T> = {
      id: norm,
      interfaceName: subpathIfaces[0],
      compartment,
      exports: exportsNamespace,
      instance: (exportsNamespace.default ?? exportsNamespace) as T,
      metadata: manifest ?? undefined,
      proxiedDocument,
    };

    this.moduleInstances.set(norm, instance);
    return instance;
  }

  public async spawn<T = unknown>(moduleId: string, ...args: any[]): Promise<T> {
    const norm = normalizeScopedId(moduleId, this.namespace);

    const mod = await this.loadModule<any>(norm);
    const exports = mod.exports;

    let target: any = exports.default ?? exports;

    if (target && typeof target === "object") {
      const keys = Object.keys(target);
      if (keys.length === 1 && typeof target[keys[0]] === "function") {
        target = target[keys[0]];
      }
    }

    if (typeof target === "function") {
      const isConstructor = Boolean(
        target.prototype && (Object.getOwnPropertyNames(target.prototype).length > 1 || target.prototype.constructor)
      );

      let created: any;
      if (isConstructor) {
        try {
          created = new target(...args);
        } catch {
          created = target(...args);
        }
      } else {
        created = target(...args);
      }

      mod.instance = created;
      this.moduleInstances.set(norm, mod);
      return created as T;
    }

    return target as T;
  }

  public async startInitModule(initModule: ModuleInstance<any>, ctx: InitModuleContext): Promise<unknown> {
    const exports = initModule.exports;
    const initFn = (exports as any).init ?? (exports as any).default?.init ?? (exports as any).default;

    if (typeof initFn !== "function") {
      throw new Error(`Init module '${initModule.id}' does not export an 'init' function.`);
    }

    return await initFn(ctx);
  }

  public async bootstrapInit(
    initModuleId: string = "@cathodique/init",
    ctx: Partial<InitModuleContext> = {}
  ): Promise<unknown> {
    if (this.initModuleLoaded) {
      throw new Error("Init module already loaded. Re-bootstrapping PID 1 is forbidden.");
    }
    this.initModuleLoaded = true;

    const normInitId = normalizeScopedId(initModuleId, this.namespace);
    const initModule = await this.loadModule<any>(normInitId, ["init", "host", "dmabuf"]);

    const fullCtx: InitModuleContext = {
      globalThis,
      loader: this,
      membrane: this.membrane,
      $: $,
      config: this.config,
      iframeElement: ctx.iframeElement,
      require: typeof require !== "undefined" ? require : undefined,
      DmabufBridgeClient: ctx.DmabufBridgeClient,
      ...ctx,
    };

    return await this.startInitModule(initModule, fullCtx);
  }
}

export function createCathodiqueLoader(config?: ModuleLoaderConfig): CathodiqueModuleLoader {
  return new CathodiqueModuleLoader(config);
}
