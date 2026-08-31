import type { InterfaceExportMap } from "../../../core/types.js";

export const exportMap: InterfaceExportMap = {
  loadModule: { type: "function", required: true },
  spawn: { type: "function", required: true },
  resolve: { type: "function", required: true },
};

export default {
  name: "@cathodique/loader-iface",
  version: "1.0.0",
  exportMap,
};
