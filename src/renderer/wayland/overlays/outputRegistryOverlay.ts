import { OutputConfiguration, OutputRegistry } from "@cathodique/wl-serv-high/registries";
import { Output } from "../../classes/wayland/output/output";
import { Reactive } from "@cathodique/wl-serv-high/lib";

class OutputRegistryOverlay extends OutputRegistry {
  // Singleton
  static #instance: OutputRegistry;
  static create() {
    return new OutputRegistryOverlay();
  }
  private constructor() {
    super();
    if (OutputRegistryOverlay.#instance) throw new Error("Tried to create multiple seat registries");
    OutputRegistryOverlay.#instance = this;
  }

  // TODO Memory management
  outputs = new Map<Reactive<OutputConfiguration>, Output>();
  allOutputs() {
    return this.outputs.values();
  }
  outputOfCfg(config: Reactive<OutputConfiguration>) {
    return this.outputs.get(config);
  }

  addAuthority(cfg: Reactive<OutputConfiguration>) {
    super.addAuthority(cfg);
    this.outputs.set(cfg, new Output(cfg, this));
  }
}

export const outputRegistry = OutputRegistryOverlay.create();
