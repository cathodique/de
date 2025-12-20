import { Module } from "./module.js";

interface OrchestratorData {
  defaults: Record<string, string>;
}

export class Orchestrator {
  data: OrchestratorData;

  constructor() {
    const script = document.querySelector("script[type=\"application/vnd.raytube.orchestrator-data\"]");

    if (!script || !script.textContent) throw new Error("Cannot orchestrate: No script");

    this.data = JSON.parse(script.textContent);
  }

  loaded = new Map<string, Module>();
  load(schemaName: string) {
    if (this.loaded.has(schemaName)) return this.loaded.get(schemaName)!;
    const module = Module.getModule(this.data.defaults[schemaName]);
    this.loaded.set(schemaName, module);
    return module;
  }
}
