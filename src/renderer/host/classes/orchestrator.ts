import { BaseModule } from "./module.js";

interface OrchestratorData {
  defaults: Record<string, string>;
  defaultsAll: Record<string, string[]>;
  moduleData: {
    [k in string]: {
      opaqueToken: string;
    };
  };
}

export class Orchestrator {
  data: OrchestratorData;
  defaults = new Map<string, string>();
  defaultsAll = new Map<string, string[]>();

  overrides = new Map<string, string>();
  overridesAll = new Map<string, string[]>();

  constructor() {
    const script = document.querySelector("script[type=\"application/vnd.raytube.orchestrator-data\"]");

    if (!script || !script.textContent) throw new Error("Cannot orchestrate: No script");

    this.data = JSON.parse(script.textContent);

    for (const [k, v] of Object.entries(this.data.defaults)) this.defaults.set(k, v);
    for (const [k, v] of Object.entries(this.data.defaultsAll)) this.defaultsAll.set(k, v);
  }
  addOverride(str: string, module: string) {
    this.overrides.set(str, module);
  }
  addOverrideAll(str: string, modules: string[]) {
    this.overridesAll.set(str, modules);
  }

  async load(schemaName: string) {
    const overriddenBy = this.overrides.get(schemaName);

    const moduleName = overriddenBy ?? this.defaults.get(schemaName);
    if (!moduleName) return undefined;

    if (BaseModule.summonnedModules.has(moduleName)) {
      return BaseModule.summonnedModules.get(moduleName);
    }

    const mod = await BaseModule.getModule(moduleName);
    BaseModule.addModule(moduleName, mod);
    return mod;
  }

  loadAll(schemaName: string) {
    const overriddenBy = this.overridesAll.get(schemaName);

    const moduleNames = overriddenBy ?? this.data.defaultsAll[schemaName];
    if (!moduleNames) return undefined;

    return Promise.all(moduleNames.map(async (moduleName: string) => {
      const mod = await BaseModule.getModule(moduleName)!;
      BaseModule.addModule(moduleName, mod);
      return mod;
    }));
  }
}

export const orchestrator = new Orchestrator();
