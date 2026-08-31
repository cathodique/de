import type { InterfaceExportMap } from "../../../core/types.js";

export const exportMap: InterfaceExportMap = {
  start: { type: "function", required: true },
  stop: { type: "function", required: true },
  status: { type: "function", required: false },
};

export default {
  name: "@cathodique/service-iface",
  version: "1.0.0",
  exportMap,
};
