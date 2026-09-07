/**
 * Cathodique Init Interface Definition (@cathodique/init-iface).
 */

import { z } from "zod";
import type {
  InterfaceExportMap,
  ModuleLoaderApi,
  DomMembraneApi,
  ModuleLoaderConfig,
  ModuleMetadata,
} from "../../../core/types.js";

export const IS_COMPONENT = Symbol.for("@cathodique/component");

export const ComponentMarkerSchema = z.custom<object>(
  (val: unknown) =>
    typeof val === "function" ||
    (typeof val === "object" && val !== null && (val as Record<symbol, unknown>)[IS_COMPONENT] === true),
  { message: "Must be marked with IS_COMPONENT or be a component class" }
);

export interface InitContext {
  loader: ModuleLoaderApi;
  membrane: DomMembraneApi;
  iframeElement?: HTMLIFrameElement;
  require?: NodeRequire;
  $: unknown;
  config?: ModuleLoaderConfig;
  manifest?: ModuleMetadata;
  [key: string]: unknown;
}

export interface InitModule {
  init(context: InitContext): Promise<unknown>;
}

export const InitModuleSchema = z.object({
  init: z.function(),
  default: z.optional(z.function()),
});

export type ModuleStructure = {
  init: (context: InitContext) => Promise<unknown>;
  default?: (context: InitContext) => Promise<unknown>;
};

export const exportMap: InterfaceExportMap = {
  init: { type: "function", required: true },
};
