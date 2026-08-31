/**
 * Core type definitions for the Cathodique SES Module System & Runtime.
 */

import type { ModuleSource } from "ses";
import type { AbstractWindow, WindowGeometry } from "./window.js";

export * from "./window.js";

export type ExportType =
  | "function"
  | "class"
  | "object"
  | "string"
  | "number"
  | "boolean"
  | "symbol"
  | "any";

export interface ExportRequirement {
  type: ExportType;
  required?: boolean;
  description?: string;
  validate?: (value: unknown) => boolean | string;
}

export type InterfaceExportMap = Record<string, ExportRequirement | ExportType>;

export interface InterfaceDefinition<T = unknown> {
  name: string;
  type?: "interface";
  version?: string;
  description?: string;
  exportMap: InterfaceExportMap;
  validate?: (exports: Record<string, unknown>) => boolean | string;
}

export interface ModuleMetadata {
  id: string;
  name?: string;
  type?: "module" | "interface";
  interface?: string;
  interfaceName?: string;
  implements?: string[];
  version?: string;
  description?: string;
  main?: string;
  capabilities?: string[];
  exportMap?: InterfaceExportMap;
  [key: string]: unknown;
}

export interface ModuleRecord {
  id: string;
  sourceCode?: string;
  sourceUrl?: string;
  moduleSource?: ModuleSource;
  metadata?: ModuleMetadata;
  exports?: Record<string, unknown>;
}

export interface ModuleInstance<T = unknown> {
  id: string;
  interfaceName?: string;
  compartment: Compartment;
  exports: Record<string, unknown>;
  instance?: T;
  metadata?: ModuleMetadata;
  proxiedDocument?: Document;
}

export interface DomMembraneApi {
  initScriptlessIframe(iframe: HTMLIFrameElement): { document: Document; root: HTMLElement };
  getDesktopRoot(): HTMLElement | null;
  createDocumentProxy(domainId: string): Document | undefined;
  wrapNode<T extends Node>(node: T, domainId: string): T;
  unwrapNode(nodeOrProxy: any): Node;
  claimNode(node: Node, ownerId: string): boolean;
  isOwner(node: Node, ownerId: string): boolean;
  getOwner(node: Node): string | undefined;
  canMutate(node: Node, callerId: string): boolean;
  wrap<T>(value: T, sourceDomain: string, targetDomain: string): T;
}

export interface ModuleLoaderConfig {
  namespace?: string;
  baseURL?: string;
  cdnURL?: string;
  initModule?: string;
  firstModule?: string;
  interfaces?: Record<string, string>;
  defaultEndowments?: Record<string, unknown>;
  hostModules?: Record<string, any>;
  wayland?: {
    enabled?: boolean;
    socketPath?: string;
    [key: string]: unknown;
  };
}

export interface InitModuleContext {
  globalThis: typeof globalThis;
  require?: NodeRequire;
  $: any;
  config: ModuleLoaderConfig;
  loader: ModuleLoaderApi;
  wlServHigh?: any;
  wlServHighRegistries?: any;
  iframeElement?: HTMLIFrameElement;
  membrane: DomMembraneApi;
}

export interface ModuleLoaderApi {
  registerInterface<T>(definition: InterfaceDefinition<T>): void;
  loadInterface<T = unknown>(interfaceId: string): Promise<InterfaceDefinition<T>>;
  getInterface<T>(name: string): InterfaceDefinition<T> | undefined;
  listRegisteredInterfaces(): InterfaceDefinition<any>[];
  discoverImplementingModules(interfaceName: string): Promise<ModuleMetadata[]>;
  registerModule(record: ModuleRecord): void;
  registerHostModule(specifier: string, exportsNamespace: Record<string, unknown>): void;
  loadManifest(moduleId: string): Promise<ModuleMetadata | null>;
  loadModule<T = unknown>(moduleId: string, options?: { isInit?: boolean; interfaceName?: string }): Promise<ModuleInstance<T>>;
  spawn<T = unknown>(interfaceName: string, moduleId?: string): Promise<T>;
  resolve<T = unknown>(interfaceName: string): T | undefined;
  resolveModuleId(interfaceName: string, preferredModuleId?: string): string;
}
