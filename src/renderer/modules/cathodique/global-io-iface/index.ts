/**
 * Cathodique Global IO Interface Definition (@cathodique/global-io-iface).
 */

import { z } from "zod";
import { IS_COMPONENT, ComponentMarkerSchema } from "@cathodique/init-iface";

export interface ModifiersState {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  capsLock: boolean;
  numLock: boolean;
  depressed: number;
  latched: number;
  locked: number;
  group: number;
}

export interface IGlobalIO {
  readonly modifiers: ModifiersState;
  start(): void;
  stop(): void;
  getModifiers(): ModifiersState;
  isModifierActive(mod: "shift" | "ctrl" | "alt" | "meta" | "capsLock" | "numLock"): boolean;
  onModifiersChange(callback: (mods: ModifiersState) => void): () => void;
  trackMouseRelease(eventOrButton: MouseEvent | number, callback: (releaseEvent: MouseEvent) => void): () => void;
}

export type GlobalIO = IGlobalIO;

export const GlobalIOModuleSchema = z.object({
  GlobalIO: z.intersection(
    z.custom<new () => IGlobalIO>(
      (val) => typeof val === "function" && Boolean(val.prototype),
      { message: "GlobalIO must be a constructor class" }
    ),
    ComponentMarkerSchema
  ).optional(),
  globalIO: z.any().optional(),
  getModifiers: z.function().optional(),
  trackMouseRelease: z.function().optional(),
  onModifiersChange: z.function().optional(),
  default: z.any().optional(),
});

export type ModuleStructure = {
  GlobalIO?: new () => IGlobalIO;
  globalIO?: IGlobalIO;
  getModifiers?: () => ModifiersState;
  trackMouseRelease?: (eventOrButton: MouseEvent | number, callback: (releaseEvent: MouseEvent) => void) => () => void;
  onModifiersChange?: (callback: (mods: ModifiersState) => void) => () => void;
  default?: any;
};

export function processModule(
  module: unknown,
  signalFault: (fault: Fault) => void
): ModuleStructure | undefined {
  const parseResult = GlobalIOModuleSchema.safeParse(module);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    signalFault(new ProviderFault(`GlobalIO module failed schema validation: ${errorDetails}`));
    return undefined;
  }
  return module as ModuleStructure;
}
