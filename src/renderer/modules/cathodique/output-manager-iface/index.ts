/**
 * Cathodique OutputManager Interface Definition (@cathodique/output-manager-iface).
 */

import { z } from "zod";
import type { AbstractWindow } from "@cathodique/window-iface";
import type { IOutput, OutputConfiguration } from "@cathodique/output-iface";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";

export type { IOutput, OutputConfiguration, Output } from "@cathodique/output-iface";

export interface IOutputManager {
  getRootElement(): HTMLElement;
  attachToContainer(container: HTMLElement): void;
  registerOutput(outputOrConfig: IOutput | OutputConfiguration): IOutput;
  unregisterOutput(outputOrId: IOutput | string): void;
  getOutputs(): IOutput[];
  getOutput(id: string): IOutput | undefined;
  getOutputForElement(element: HTMLElement): IOutput | undefined;
  trackWindow(window: AbstractWindow): () => void;
  checkWindowIntersections(window: AbstractWindow): IOutput[];
}

export type OutputManager = IOutputManager;

export const OutputManagerModuleSchema = z.object({
  OutputManager: z.intersection(
    z.custom<new (...args: any[]) => IOutputManager>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "OutputManager must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  createOutputManager: z.function().optional(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  OutputManager?: new (...args: any[]) => IOutputManager;
  createOutputManager?: (...args: any[]) => IOutputManager;
  default?: any;
};

export function processModule(
  module: unknown,
  signalFault: (fault: Fault) => void
): ModuleStructure | undefined {
  const parseResult = OutputManagerModuleSchema.safeParse(module);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    signalFault(new ProviderFault(`OutputManager module failed schema validation: ${errorDetails}`));
    return undefined;
  }
  return module as ModuleStructure;
}

export const exportMap = {
  OutputManager: { type: "class", required: false },
  createOutputManager: { type: "function", required: false },
};

export default {
  name: "@cathodique/output-manager-iface",
  version: "1.0.0",
  exportMap,
};
