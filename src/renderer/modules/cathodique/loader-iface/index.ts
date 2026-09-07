/**
 * Cathodique Module Loader Interface Definition (@cathodique/loader-iface).
 */

import { z } from "zod";
import type { InterfaceExportMap } from "../../../core/types.js";

export interface ModuleLoader {
  loadModule<T = unknown>(moduleId: string, options?: { isInit?: boolean }): Promise<any>;
  spawn<T = unknown>(moduleId: string): Promise<T>;
  resolve<T = unknown>(moduleId: string): T | undefined;
  resolveModuleId(moduleId: string): string;
}

export const LoaderModuleSchema = z.object({
  loadModule: z.function(),
  spawn: z.function(),
  resolve: z.function(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  loadModule: <T = unknown>(moduleId: string, options?: { isInit?: boolean }) => Promise<any>;
  spawn: <T = unknown>(moduleId: string) => Promise<T>;
  resolve: <T = unknown>(moduleId: string) => T | undefined;
  default?: any;
};

export function processModule(
  module: unknown,
  signalFault: (fault: Fault) => void
): ModuleStructure | undefined {
  const parseResult = LoaderModuleSchema.safeParse(module);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    signalFault(new ProviderFault(`Loader module failed schema validation: ${errorDetails}`));
    return undefined;
  }
  return module as ModuleStructure;
}

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
