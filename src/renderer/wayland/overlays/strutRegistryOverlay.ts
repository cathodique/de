import { StrutRegistry } from "@cathodique/wl-serv-high/registries";

class StrutRegistryOverlay extends StrutRegistry {
  // Singleton
  static #instance: StrutRegistry;
  static create() {
    return new StrutRegistryOverlay();
  }
  private constructor() {
    super();
    if (StrutRegistryOverlay.#instance) throw new Error("Tried to create multiple strut registries");
    StrutRegistryOverlay.#instance = this;
  }
}

export const strutRegistry = StrutRegistryOverlay.create();
