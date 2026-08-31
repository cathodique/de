/**
 * Layer Management Module for Cathodique.
 */

export interface LayerItem {
  id: string;
  name: string;
  zIndex: number;
  hostElement?: HTMLElement;
  createdAt: number;
}

const layers = new Map<string, LayerItem>();

export function createLayer(name: string, zIndex: number): LayerItem {
  let hostElement: HTMLElement | undefined;

  if (typeof document !== "undefined") {
    try {
      hostElement = document.createElement("div");
      hostElement.className = `layer-container layer-${name}`;
      hostElement.style.position = "absolute";
      hostElement.style.inset = "0";
      hostElement.style.width = "100%";
      hostElement.style.height = "100%";
      hostElement.style.zIndex = zIndex.toString();
      hostElement.style.pointerEvents = "none";
    } catch {}
  }

  const layer: LayerItem = {
    id: `layer-${name}`,
    name,
    zIndex,
    hostElement,
    createdAt: Date.now(),
  };

  layers.set(name, layer);
  return layer;
}

export function getLayer(name: string): LayerItem | undefined {
  return layers.get(name);
}

export function listLayers(): LayerItem[] {
  return Array.from(layers.values());
}

export default {
  createLayer,
  getLayer,
  listLayers,
};
