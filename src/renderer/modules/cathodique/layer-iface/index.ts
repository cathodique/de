import type { InterfaceExportMap } from "../../../core/types.js";

export const exportMap: InterfaceExportMap = {
  createLayer: { type: "function", required: true },
  getLayer: { type: "function", required: true },
  listLayers: { type: "function", required: true },
};

export default {
  name: "@cathodique/layer-iface",
  version: "1.0.0",
  exportMap,
};
