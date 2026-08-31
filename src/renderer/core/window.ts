/**
 * Statified Abstract Window model for Cathodique.
 * Decouples Window Managers from underlying window sources (Wayland, Web/DOM, Canvas, etc.).
 */

import $ from "informa";

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
  public geometry: WindowGeometry = { x: 100, y: 100, width: 640, height: 480 };

  public abstract close(): void;
  public abstract focus(): void;
  public abstract configure?(bounds: Partial<WindowGeometry>): void;
  public abstract onDestroy(callback: () => void): () => void;
}

/**
 * Statified Abstract Window class powered by Informa.
 * Changes to title, geometry, or state trigger Informa reactivity automatically.
 */
export const AbstractWindow: typeof BaseAbstractWindow = $.makeStatified(BaseAbstractWindow as any);
export type AbstractWindow = BaseAbstractWindow;
