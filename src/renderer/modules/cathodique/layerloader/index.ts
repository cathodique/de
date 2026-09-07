/**
 * Cathodique LayerLoader Subsystem (@cathodique/layerloader).
 * Orchestrates rendering stacks, backdrop z-indexing, and container management.
 * Implements @cathodique/layer-iface.
 */

import $ from "informa";
import {
  type Layer as ILayer,
  type LayerLoader as ILayerLoader,
  type LayerConfig,
  DEFAULT_LAYERS,
} from "@cathodique/layer-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";
import type { ModuleLoaderApi } from "../../../core/types.js";

export class Layer implements ILayer {
  static readonly [IS_COMPONENT] = true;

  public readonly id: string;
  public readonly name: string;
  public readonly zIndex: number;
  public readonly hostElement: HTMLElement;

  constructor(config: LayerConfig) {
    this.id = `layer-${config.name}`;
    this.name = config.name;
    this.zIndex = config.zIndex;
    this.hostElement = this.createElement();
  }

  private createElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = `cathodique-layer cathodique-layer-${this.name}`;
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.zIndex = `${this.zIndex}`;
    el.style.pointerEvents = this.name === "desktop-workspace" ? "auto" : "none";
    el.style.overflow = "hidden";
    return el;
  }

  public attach(child: HTMLElement): void {
    this.hostElement.appendChild(child);
  }

  public detach(child: HTMLElement): void {
    if (this.hostElement.contains(child)) {
      this.hostElement.removeChild(child);
    }
  }
}

export class LayerLoader implements ILayerLoader {
  static readonly [IS_COMPONENT] = true;

  private layers = new Map<string, ILayer>();
  private rootElement: HTMLElement;

  constructor(layerConfigs: LayerConfig[] = DEFAULT_LAYERS) {
    this.rootElement = this.createRootElement();
    for (const config of layerConfigs) {
      this.createLayer(config.name, config.zIndex);
    }
  }

  private createRootElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cathodique-layers-root";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.overflow = "hidden";
    return el;
  }

  public getRootElement(): HTMLElement {
    return this.rootElement;
  }

  public createLayer(name: string, zIndex: number): ILayer {
    let layer = this.layers.get(name);
    if (layer) return layer;

    layer = new Layer({ name, zIndex });
    this.layers.set(name, layer);
    this.rootElement.appendChild(layer.hostElement);
    return layer;
  }

  public getLayer(name: string): ILayer {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Compositor layer "${name}" does not exist`);
    }
    return layer;
  }

  public listLayers(): ILayer[] {
    return Array.from(this.layers.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  public attachToLayer(layerName: string, child: HTMLElement): boolean {
    const layer = this.getLayer(layerName);
    if (layer) {
      layer.attach(child);
      return true;
    }
    return false;
  }

  /**
   * Helper that instantiates a component and immediately attaches it to a named layer.
   */
  public async loadToLayer<T = unknown>(
    layerName: string,
    loaderFn: () => Promise<T>
  ): Promise<T> {
    const component = await loaderFn();
    const el = (component as { getRootElement?: () => HTMLElement; hostElement?: HTMLElement; element?: HTMLElement })?.getRootElement?.()
      ?? (component as { hostElement?: HTMLElement }).hostElement
      ?? (component as { element?: HTMLElement }).element;

    if (el) {
      this.attachToLayer(layerName, el as HTMLElement);
    }
    return component;
  }

  /**
   * Imports a layer module by name and mounts it into the specified layer.
   */
  public async importModuleToLayer<T = unknown>(
    layerName: string,
    moduleSpecifier: string,
    loaderApi: ModuleLoaderApi
  ): Promise<T> {
    return this.loadToLayer(layerName, async () => {
      if (typeof loaderApi?.spawn === "function") {
        return await loaderApi.spawn<T>(moduleSpecifier);
      }
      if (typeof loaderApi?.loadModule === "function") {
        const mod = await loaderApi.loadModule<T>(moduleSpecifier);
        return (mod.instance ?? mod.exports.default ?? mod.exports) as T;
      }
      throw new Error("Invalid loader API provided to importModuleToLayer");
    });
  }
}

export function createLayerLoader(): LayerLoader {
  return new LayerLoader();
}

export default LayerLoader;
