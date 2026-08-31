import type { InterfaceExportMap } from "../../../core/types.js";

export const exportMap: InterfaceExportMap = {
  init: { type: "function", required: true },
  default: { type: "any", required: false },
};

export default {
  name: "@cathodique/init-iface",
  version: "1.0.0",
  exportMap,
};
