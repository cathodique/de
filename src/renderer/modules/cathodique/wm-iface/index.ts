/**
 * Cathodique Window Manager Interface Definition (@cathodique/wm-iface).
 */

import { z } from "zod";
import type { AbstractWindow } from "@cathodique/window-iface";
import type { InterfaceExportMap } from "../../../core/types.js";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";

export interface ManagedWindow {
  id: string;
  window: AbstractWindow;
  hostElement: HTMLElement;
  zIndex: number;
}

export interface WindowManager {
  getWorkspaceElement(): HTMLElement;
  manageWindow(window: AbstractWindow): ManagedWindow;
  unmanageWindow(windowOrId: AbstractWindow | string): void;
  getManagedWindows(): ManagedWindow[];
}

export type IWindowManager = WindowManager;

export const WMModuleSchema = z.object({
  WindowManager: z.intersection(
    z.custom<new (...args: any[]) => WindowManager>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "WindowManager must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  SampleWindowManager: z.intersection(
    z.custom<new (...args: any[]) => WindowManager>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "SampleWindowManager must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  createWindowManager: z.function().optional(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  WindowManager?: new (...args: any[]) => WindowManager;
  SampleWindowManager?: new (...args: any[]) => WindowManager;
  createWindowManager?: (...args: any[]) => WindowManager;
  default?: any;
};

export function processModule(
  module: unknown,
  signalFault: (fault: Fault) => void
): ModuleStructure | undefined {
  const parseResult = WMModuleSchema.safeParse(module);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    signalFault(new ProviderFault(`WM module failed schema validation: ${errorDetails}`));
    return undefined;
  }
  return module as ModuleStructure;
}

export const exportMap: InterfaceExportMap = {
  WindowManager: { type: "class", required: false },
  SampleWindowManager: { type: "class", required: false },
  createWindowManager: { type: "function", required: false },
};

export default {
  name: "@cathodique/wm-iface",
  version: "1.0.0",
  exportMap,
};
