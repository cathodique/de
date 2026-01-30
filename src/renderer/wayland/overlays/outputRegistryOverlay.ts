import { OutputConfiguration, OutputRegistry } from "@cathodique/wl-serv-high/registries";
import { Output } from "../../classes/wayland/output/output";

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
  outputs = new Map<OutputConfiguration, Output>();
  allOutputs() {
    return this.outputs.values();
  }
  outputOfCfg(config: OutputConfiguration) {
    return this.outputs.get(config);
  }

  addAuthority(cfg: OutputConfiguration) {
    super.addAuthority(cfg);
    this.outputs.set(cfg, new Output(cfg, this));
  }
}

export const outputRegistry = OutputRegistryOverlay.create();
