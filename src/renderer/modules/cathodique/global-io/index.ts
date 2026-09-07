/**
 * Cathodique Global I/O Module (@cathodique/global-io).
 * Tracks global keyboard modifiers and provides mouse release tracking across window boundaries.
 */

import $ from "informa";
import type { ModifiersState, IGlobalIO } from "@cathodique/global-io-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";

export { ModifiersState };

// Standard XKB modifier bitmasks for Wayland seats
const MOD_SHIFT = 1 << 0;
const MOD_CAPS = 1 << 1;
const MOD_CTRL = 1 << 2;
const MOD_ALT = 1 << 3;
const MOD_NUM = 1 << 4;
const MOD_META = 1 << 6;

class BaseModifiersState implements ModifiersState {
  public shift = false;
  public ctrl = false;
  public alt = false;
  public meta = false;
  public capsLock = false;
  public numLock = false;
  public depressed = 0;
  public latched = 0;
  public locked = 0;
  public group = 0;
}

const StatifiedModifiers = $.makeStatified(BaseModifiersState);

export class GlobalIO implements IGlobalIO {
  static readonly [IS_COMPONENT] = true;

  public readonly modifiers: ModifiersState = new StatifiedModifiers();
  private modifierListeners = new Set<(mods: ModifiersState) => void>();
  private releaseListeners = new Set<{ button: number; cb: (e: MouseEvent) => void }>();
  private active = false;

  constructor() {
    this.start();
  }

  public start(): void {
    if (this.active) return;
    this.active = true;

    window.addEventListener("keydown", this.handleKeyEvent, true);
    window.addEventListener("keyup", this.handleKeyEvent, true);
    window.addEventListener("mouseup", this.handleMouseUp, true);
    window.addEventListener("pointerup", this.handleMouseUp, true);
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;

    window.removeEventListener("keydown", this.handleKeyEvent, true);
    window.removeEventListener("keyup", this.handleKeyEvent, true);
    window.removeEventListener("mouseup", this.handleMouseUp, true);
    window.removeEventListener("pointerup", this.handleMouseUp, true);
  }

  private handleKeyEvent = (e: KeyboardEvent): void => {
    this.updateModifiersFromEvent(e);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    this.updateModifiersFromEvent(e);

    const button = e.button;
    for (const entry of Array.from(this.releaseListeners)) {
      if (entry.button === button || entry.button === -1) {
        this.releaseListeners.delete(entry);
        entry.cb(e);
      }
    }
  };

  public updateModifiersFromEvent(e: KeyboardEvent | MouseEvent): void {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const meta = e.metaKey;
    const capsLock = typeof e.getModifierState === "function" ? e.getModifierState("CapsLock") : this.modifiers.capsLock;
    const numLock = typeof e.getModifierState === "function" ? e.getModifierState("NumLock") : this.modifiers.numLock;

    let depressed = 0;
    if (shift) depressed |= MOD_SHIFT;
    if (ctrl) depressed |= MOD_CTRL;
    if (alt) depressed |= MOD_ALT;
    if (meta) depressed |= MOD_META;

    let locked = 0;
    if (capsLock) locked |= MOD_CAPS;
    if (numLock) locked |= MOD_NUM;

    const changed =
      this.modifiers.shift !== shift ||
      this.modifiers.ctrl !== ctrl ||
      this.modifiers.alt !== alt ||
      this.modifiers.meta !== meta ||
      this.modifiers.capsLock !== capsLock ||
      this.modifiers.numLock !== numLock;

    this.modifiers.shift = shift;
    this.modifiers.ctrl = ctrl;
    this.modifiers.alt = alt;
    this.modifiers.meta = meta;
    this.modifiers.capsLock = capsLock;
    this.modifiers.numLock = numLock;
    this.modifiers.depressed = depressed;
    this.modifiers.locked = locked;

    if (changed) {
      for (const listener of this.modifierListeners) {
        listener(this.modifiers);
      }
    }
  }

  public getModifiers(): ModifiersState {
    return this.modifiers;
  }

  public isModifierActive(mod: "shift" | "ctrl" | "alt" | "meta" | "capsLock" | "numLock"): boolean {
    return Boolean(this.modifiers[mod]);
  }

  public onModifiersChange(callback: (mods: ModifiersState) => void): () => void {
    this.modifierListeners.add(callback);
    return () => this.modifierListeners.delete(callback);
  }

  /**
   * Given an initial MouseEvent or button code, tracks when that mouse button is released anywhere.
   */
  public trackMouseRelease(
    eventOrButton: MouseEvent | number,
    callback: (releaseEvent: MouseEvent) => void
  ): () => void {
    const targetButton = typeof eventOrButton === "number" ? eventOrButton : eventOrButton.button;
    const entry = { button: targetButton, cb: callback };
    this.releaseListeners.add(entry);

    return () => {
      this.releaseListeners.delete(entry);
    };
  }
}

export const globalIO = new GlobalIO();

export function getModifiers(): ModifiersState {
  return globalIO.getModifiers();
}

export function trackMouseRelease(
  eventOrButton: MouseEvent | number,
  callback: (releaseEvent: MouseEvent) => void
): () => void {
  return globalIO.trackMouseRelease(eventOrButton, callback);
}

export function onModifiersChange(callback: (mods: ModifiersState) => void): () => void {
  return globalIO.onModifiersChange(callback);
}

export default GlobalIO;
