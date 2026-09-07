/**
 * Cathodique Layer Interface Definition (@cathodique/layer-iface).
 * Defines the contract for individual compositor layers and layer loaders.\n */

import { z } from "zod";
import type { InterfaceExportMap, ModuleLoaderApi } from "../../../core/types.js";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";

export const LayerConfigSchema = z.object({
  name: z.string(),
  zIndex: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LayerConfig = z.infer<typeof LayerConfigSchema>;

export interface ILayer {
  readonly id: string;
  readonly name: string;
  readonly zIndex: number;
  readonly hostElement: HTMLElement;
  attach(child: HTMLElement): void;
  detach(child: HTMLElement): void;
}

export type Layer = ILayer;
export type LayerItem = ILayer;

export interface LayerLoader {
  getRootElement(): HTMLElement;
  createLayer(name: string, zIndex: number): ILayer;
  getLayer(name: string): ILayer;
  listLayers(): ILayer[];
  attachToLayer(layerName: string, child: HTMLElement): boolean;
  loadToLayer<T = unknown>(layerName: string, loaderFn: () => Promise<T>): Promise<T>;
  importModuleToLayer<T = unknown>(layerName: string, moduleSpecifier: string, loaderApi: ModuleLoaderApi): Promise<T>;
}

export type ILayerLoader = LayerLoader;

export const DEFAULT_LAYERS: LayerConfig[] = [
  { name: "background", zIndex: 0 },
  { name: "desktop-workspace", zIndex: 100 },
  { name: "windows", zIndex: 500 },
  { name: "overlays-panel", zIndex: 1000 },
  { name: "lockscreen", zIndex: 9999 },
];

export const LayerModuleSchema = z.object({
  Layer: z.intersection(
    z.custom<new (config: LayerConfig) => ILayer>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "Layer must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  LayerLoader: z.intersection(
    z.custom<new (layerModules?: string[]) => LayerLoader>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "LayerLoader must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  createLayerLoader: z.function().optional(),
  default: z.optional(z.custom<new (layerModules?: string[]) => LayerLoader>()),
});

export type ModuleStructure = {
  Layer?: new (config: LayerConfig) => ILayer;
  LayerLoader?: new (layerModules?: string[]) => LayerLoader;
  createLayerLoader?: (...args: unknown[]) => LayerLoader;
  default?: unknown;
};

export const exportMap: InterfaceExportMap = {
  LayerLoader: { type: "class", required: false },
  Layer: { type: "class", required: false },
  createLayerLoader: { type: "function", required: false },
};
