/**
 * Cathodique Service Interface Definition (@cathodique/service-iface).
 */

import { z } from "zod";
import type { InterfaceExportMap } from "../../../core/types.js";

export interface Service {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  status?(): string;
}

export type IService = Service;

export const ServiceModuleSchema = z.object({
  start: z.function().optional(),
  stop: z.function().optional(),
  status: z.function().optional(),
  SampleService: z.any().optional(),
  createService: z.function().optional(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  start?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
  status?: () => unknown;
  SampleService?: any;
  createService?: () => any;
  default?: any;
};

export function processModule(
  module: unknown,
  signalFault: (fault: Fault) => void
): ModuleStructure | undefined {
  const parseResult = ServiceModuleSchema.safeParse(module);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    signalFault(new ProviderFault(`Service module failed schema validation: ${errorDetails}`));
    return undefined;
  }
  return module as ModuleStructure;
}

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
