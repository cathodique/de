/**
 * Cathodique Display Output Model Subsystem (@cathodique/output).
 */

import $ from "informa";
import type { AbstractWindow, WindowGeometry } from "@cathodique/window-iface";
import type { IOutput, OutputConfiguration } from "@cathodique/output-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";

export function rectsOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    r1.x + r1.width <= r2.x ||
    r1.x >= r2.x + r2.width ||
    r1.y + r1.height <= r2.y ||
    r1.y >= r2.y + r2.height
  );
}

export function domRectsOverlap(r1: DOMRect, r2: DOMRect): boolean {
  return !(
    r1.right <= r2.left ||
    r1.left >= r2.right ||
    r1.bottom <= r2.top ||
    r1.top >= r2.bottom
  );
}

export class Output implements IOutput {
  static readonly [IS_COMPONENT] = true;

  public readonly id: string;
  public config: OutputConfiguration;
  public containerElement: HTMLElement;
  public windows = new Set<AbstractWindow>();

  constructor(config: OutputConfiguration) {
    this.id = config.id ?? `out-${Math.random().toString(36).slice(2, 7)}`;
    const width = config.width ?? config.w ?? config.effectiveW ?? 1920;
    const height = config.height ?? config.h ?? config.effectiveH ?? 1080;
    this.config = {
      ...config,
      width,
      height,
    };
    this.containerElement = this.createContainerElement();
  }

  private createContainerElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = `cathodique-output output-${this.id}`;
    el.style.position = "absolute";
    el.style.left = `${this.config.x}px`;
    el.style.top = `${this.config.y}px`;
    el.style.width = `${this.config.width ?? this.config.w}px`;
    el.style.height = `${this.config.height ?? this.config.h}px`;
    el.style.overflow = "hidden";
    el.style.pointerEvents = "none";
    return el;
  }

  public attachToContainer(parent: HTMLElement): void {
    parent.appendChild(this.containerElement);
  }

  public detachFromContainer(): void {
    if (this.containerElement.parentNode) {
      this.containerElement.parentNode.removeChild(this.containerElement);
    }
  }

  public updateConfiguration(newConfig: Partial<OutputConfiguration>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.x !== undefined) this.containerElement.style.left = `${this.config.x}px`;
    if (newConfig.y !== undefined) this.containerElement.style.top = `${this.config.y}px`;
    if (this.config.width !== undefined) this.containerElement.style.width = `${this.config.width}px`;
    if (this.config.height !== undefined) this.containerElement.style.height = `${this.config.height}px`;
  }

  public addWindow(window: AbstractWindow): void {
    this.windows.add(window);
  }

  public removeWindow(window: AbstractWindow): void {
    this.windows.delete(window);
  }

  public hasWindow(window: AbstractWindow): boolean {
    return this.windows.has(window);
  }
}

export function createOutput(config: OutputConfiguration): Output {
  return new Output(config);
}

export default Output;
