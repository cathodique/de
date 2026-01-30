import { HLConnection } from "@cathodique/wl-serv-high";
import { Seat } from "./seat.js";

const knownMods = ["Shift", "Lock", "Control", "Mod1", "Mod2", "Mod3", "Mod4", "Mod5"] as const;
export class Modifiers {
  depressed = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  depressedBitmask = 0;
  latched = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  latchedBitmask = 0;
  locked = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  lockedBitmask = 0;

  group = 0;

  seat: Seat;

  constructor(seat: Seat) {
    this.seat = seat;
  }

  updateAccordingly(evt: KeyboardEvent | MouseEvent) {
    let changed = { depressed: false, latched: false, locked: false };
    function checkIfChangedAndUpdate(origin: Record<typeof knownMods[number], boolean>, modifier: typeof knownMods[number], value: boolean) {
      if (origin[modifier] === value) return false;
      origin[modifier] = value;
      return true;
    }
    // Shift: "Shift"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Shift", evt.getModifierState("Shift"));
    // Lock: "CapsLock"
    changed.locked ||= checkIfChangedAndUpdate(this.locked, "Lock", evt.getModifierState("CapsLock"));
    if (evt instanceof KeyboardEvent) changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Lock", evt.type === "keydown" && evt.key === "CapsLock");
    // Control: "Control"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Control", evt.getModifierState("Control"));
    // Mod1: "Alt"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod1", evt.getModifierState("Alt"));
    // Mod2: "NumLock"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod2", evt.getModifierState("NumLock"));
    // Mod3: "Hyper" (No Level 5 in browser spec)
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod3", evt.getModifierState("Hyper"));
    // Mod4: "Meta"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod4", evt.getModifierState("Meta"));
    // Mod5: "AltGraph"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod5", evt.getModifierState("AltGraph"));

    return changed;
  }

  static createMask(object: Record<typeof knownMods[number], boolean>) {
    let result = 0;
    for (let modIdx = 0; modIdx < knownMods.length; modIdx += 1) {
      const mask = 2 ** modIdx;
      if (object[knownMods[modIdx]]) result += mask;
    }

    return result;
  }

  update(connection: HLConnection, serial?: number) {
    const authority = this.seat.wlSeatAuth.get(connection)!;

    authority.modifiers(this.depressedBitmask, this.latchedBitmask, this.lockedBitmask, this.group, serial);
  }

  ifUpdateThenEmit(evt: KeyboardEvent | MouseEvent, connection: HLConnection) {
    const xWasUpdated = this.updateAccordingly(evt);
    if (xWasUpdated.depressed || xWasUpdated.latched || xWasUpdated.locked) {
      if (xWasUpdated.depressed)  this.depressedBitmask = Modifiers.createMask(this.depressed);
      if (xWasUpdated.latched)    this.latchedBitmask   = Modifiers.createMask(this.latched);
      if (xWasUpdated.locked)     this.lockedBitmask    = Modifiers.createMask(this.locked);

      this.update(connection);
    }
  }
}
