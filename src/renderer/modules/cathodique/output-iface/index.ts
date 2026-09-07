/**
 * Cathodique Display Output Interface Definition (@cathodique/output-iface).
 */

import { z } from "zod";
import type { AbstractWindow, WindowGeometry } from "@cathodique/window-iface";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";
import type { OutputConfiguration as WlOutputConfig } from "@cathodique/wl-serv-high/registries";

export const OutputConfigurationSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  effectiveW: z.number(),
  effectiveH: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  effectiveWidth: z.number().optional(),
  effectiveHeight: z.number().optional(),
});

export type OutputConfiguration = WlOutputConfig & {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  effectiveWidth?: number;
  effectiveHeight?: number;
};

export interface IOutput {
  readonly id: string;
  config: OutputConfiguration;
  containerElement: HTMLElement;
  attachToContainer(parent: HTMLElement): void;
  detachFromContainer(): void;
  updateConfiguration(newConfig: Partial<OutputConfiguration>): void;
}

export type Output = IOutput;

export const OutputModuleSchema = z.object({
  Output: z.intersection(
    z.custom<new (...args: any[]) => IOutput>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "Output must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  createOutput: z.function().optional(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  Output?: new (...args: any[]) => IOutput;
  createOutput?: (...args: any[]) => IOutput;
  default?: any;
};

export const exportMap = {
  Output: { type: "class", required: false },
  createOutput: { type: "function", required: false },
};
