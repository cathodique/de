import { OutputConfiguration } from "@cathodique/wl-serv-high/objects";
import { OutputRegistry } from "@cathodique/wl-serv-high/registries";
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
  seats = new Map<OutputConfiguration, Output>();
  allSeats() {
    return this.seats.values();
  }
  seatOfCfg(config: OutputConfiguration) {
    return this.seats.get(config);
  }

  addAuthority(cfg: OutputConfiguration) {
    super.addAuthority(cfg);
    this.seats.set(cfg, new Output(cfg, this));
  }
}

export const outputRegistry = OutputRegistryOverlay.create();
