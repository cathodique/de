/**
 * Cathodique Window Interface Definition (@cathodique/window-iface).
 * Decouples Window Managers from underlying window sources (Wayland, Web/DOM, Canvas, etc.).
 */

import $ from "informa";
import { z } from "zod";
import type { InterfaceExportMap } from "../../../core/types.js";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";
import type { XdgToplevel, WlSurface } from "@cathodique/wl-serv-high/objects";
import type { SeatRegistry, OutputConfiguration } from "@cathodique/wl-serv-high/registries";

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  activated: boolean;
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
}

/**
 * Base un-statified abstract class
 */
export abstract class BaseAbstractWindow {
  public abstract readonly id: string;
  public title: string = "Untitled";
  public appId?: string;
  public activated: boolean = false;
  public minimized: boolean = false;
  public maximized: boolean = false;
  public fullscreen: boolean = false;
  public geometry: WindowGeometry = { x: 0, y: 0, width: 0, height: 0 };

  public abstract close(): void;
  public abstract focus(): void;
  public abstract blur(): void;
  public abstract configure(bounds: Partial<WindowGeometry>): void;
  public abstract onDestroy(callback: () => void): () => void;
  public getSurfaceElement?(): HTMLElement | undefined;
  public enterOutput?(outputConfig: OutputConfiguration): void;
  public leaveOutput?(outputConfig: OutputConfiguration): void;
}

/**
 * Statified Abstract Window class powered by Informa.
 * Changes to title, geometry, or state trigger Informa reactivity automatically.
 */
export const AbstractWindow: new () => BaseAbstractWindow = $.makeStatified(
  class extends BaseAbstractWindow {
    public readonly id: string = "";
    public close(): void {}
    public focus(): void {}
    public blur(): void {}
    public configure(_bounds: Partial<WindowGeometry>): void {}
    public onDestroy(_callback: () => void): () => void {
      return () => {};
    }
  }
);
export type AbstractWindow = BaseAbstractWindow;

export interface ICathodiqueWindow extends AbstractWindow {
  readonly id: string;
  readonly toplevel: XdgToplevel;
  getSurface(): WlSurface;
  configure(bounds: Partial<WindowGeometry>): void;
  focus(): void;
  blur(): void;
  close(): void;
  onDestroy(callback: () => void): () => void;
  enterOutput(outputConfig: OutputConfiguration): void;
  leaveOutput(outputConfig: OutputConfiguration): void;
  sendPointerEnter(surface: WlSurface, surfaceX: number, surfaceY: number): void;
  sendPointerMove(surfaceX: number, surfaceY: number): void;
  sendPointerLeave(surface: WlSurface): void;
  sendButtonDown(button: number): void;
  sendButtonUp(button: number): void;
  sendKeyDown(keyCode: number, isRepeat?: boolean): void;
  sendKeyUp(keyCode: number): void;
  getSurfaceElement(): HTMLElement;
}

export type CathodiqueWindow = ICathodiqueWindow;

export const WindowModuleSchema = z.object({
  CathodiqueWindow: z.intersection(
    z.custom<new (toplevel: XdgToplevel, seats?: SeatRegistry, initialGeometry?: Partial<WindowGeometry>) => ICathodiqueWindow>(
      (val) => typeof val === "function"
    ),
    ComponentMarkerSchema
  ),
  createWindow: z.function(),
  default: z.optional(z.custom<new (toplevel: XdgToplevel, seats?: SeatRegistry, initialGeometry?: Partial<WindowGeometry>) => ICathodiqueWindow>()),
});

export type WindowModule = z.infer<typeof WindowModuleSchema>;

export const exportMap: InterfaceExportMap = {
  CathodiqueWindow: { type: "class", required: true },
  createWindow: { type: "function", required: false },
};
