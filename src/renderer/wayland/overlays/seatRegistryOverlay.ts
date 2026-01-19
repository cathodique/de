import { SeatConfiguration, SeatRegistry } from "@cathodique/wl-serv-high/registries";
import { Seat } from "../../classes/wayland/seat/seat";

class SeatRegistryOverlay extends SeatRegistry {
  // Singleton
  static #instance: SeatRegistry;
  static create() {
    return new SeatRegistryOverlay();
  }
  private constructor() {
    super();
    if (SeatRegistryOverlay.#instance) throw new Error("Tried to create multiple seat registries");
    SeatRegistryOverlay.#instance = this;
  }

  // TODO Memory management
  seats = new Map<SeatConfiguration, Seat>();
  allSeats() {
    return this.seats.values();
  }
  seatOfCfg(config: SeatConfiguration) {
    return this.seats.get(config);
  }

  addAuthority(cfg: SeatConfiguration) {
    super.addAuthority(cfg);
    this.seats.set(cfg, new Seat(cfg, this));
  }
}

export const seatRegistry = SeatRegistryOverlay.create();
