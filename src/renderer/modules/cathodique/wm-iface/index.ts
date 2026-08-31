import type { InterfaceExportMap } from "../../../core/types.js";

export const exportMap: InterfaceExportMap = {
  createWindow: { type: "function", required: true },
  manageWindow: { type: "function", required: false },
  closeWindow: { type: "function", required: true },
  listWindows: { type: "function", required: true },
  getWorkspaceElement: { type: "function", required: false },
};

export default {
  name: "@cathodique/wm-iface",
  version: "1.0.0",
  exportMap,
};
