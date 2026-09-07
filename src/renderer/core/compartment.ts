/**
 * Factory for creating SES Compartments.
 * Bridges host runtime and sandboxed compartments, ensuring Informa reactive state
 * and DOM capabilities propagate seamlessly across SES boundaries.
 */

import type { CompartmentOptions, ModuleDescriptor } from "ses";
import $ from "informa";
import { Fault, ConsumerFault, ProviderFault } from "./fault.js";
import { compileModuleSource } from "./ses-env.js";

export { compileModuleSource };

const INFORMA_GLOBAL_KEY = "__INFORMA__";

export interface CreateCompartmentOptions {
  name: string;
  isInit?: boolean;
  isInterface?: boolean;
  capabilities?: string[];
  endowments?: Record<string, unknown>;
  resolveHook?: (specifier: string, referrer: string) => string;
  importHook?: (specifier: string) => Promise<ModuleDescriptor>;
  moduleMap?: Record<string, ModuleDescriptor>;
}

function collectDomClasses(): Record<string, unknown> {
  const domClasses: Record<string, unknown> = {};
  if (typeof globalThis === "undefined") return domClasses;

  const propNames = Object.getOwnPropertyNames(globalThis);
  for (const name of propNames) {
    if (name === "window" || name === "document" || name === "top" || name === "parent" || name === "self") {
      continue;
    }

    if (
      name.startsWith("HTML") ||
      name.startsWith("SVG") ||
      name.startsWith("CSS") ||
      name.startsWith("DOM") ||
      name.endsWith("Event") ||
      name.endsWith("Observer") ||
      [
        "Node",
        "Element",
        "DocumentFragment",
        "Text",
        "Comment",
        "Attr",
        "ImageData",
        "Path2D",
        "CanvasRenderingContext2D",
        "OffscreenCanvas",
        "Image",
        "Audio",
        "Option",
        "Range",
        "Selection",
        "TreeWalker",
        "NodeFilter",
        "NodeIterator",
        "MutationRecord",
        "ResizeObserverEntry",
        "IntersectionObserverEntry",
      ].includes(name)
    ) {
      try {
        const val = (globalThis as any)[name];
        if (typeof val === "function") {
          domClasses[name] = harden(val);
        }
      } catch {}
    }
  }
  return domClasses;
}

export function createModuleCompartment(options: CreateCompartmentOptions): Compartment {
  const {
    name,
    isInit = false,
    isInterface = false,
    capabilities = [],
    endowments = {},
    resolveHook,
    importHook,
    moduleMap,
  } = options;

  const hasCap = isInit || capabilities.some((c) =>
    ["buffer", "cap-buffer", "host", "webgl", "canvas", "typedarray", "system", "dom"].includes(c)
  );

  const hasDomCap = isInit || capabilities.some((c) =>
    ["dom", "dom:document", "dom:window", "host", "system", "canvas", "webgl"].includes(c)
  );

  const globals: Record<string, unknown> = {
    $: harden($),
    require: (s: string) => (s === "informa" ? $ : isInit && typeof require !== "undefined" ? require(s) : (() => { throw new Error(`[Compartment '${name}'] Cannot require('${s}').`); })()),
    Date,
    Math,
    console: isInit ? console : harden({
      log: (...args: unknown[]) => console.log(`[${name}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[${name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[${name}]`, ...args),
      info: (...args: unknown[]) => console.info(`[${name}]`, ...args),
      debug: (...args: unknown[]) => console.debug(`[${name}]`, ...args),
    }),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    setInterval: setInterval.bind(globalThis),
    clearInterval: clearInterval.bind(globalThis),
    requestAnimationFrame: requestAnimationFrame.bind(globalThis),
    cancelAnimationFrame: cancelAnimationFrame.bind(globalThis),
    setImmediate: setImmediate.bind(globalThis),
    clearImmediate: clearImmediate.bind(globalThis),
    ...(isInit ? { process } : {}),
    ...(isInit || isInterface ? {
      Fault: harden(Fault),
      ConsumerFault: harden(ConsumerFault),
      ProviderFault: harden(ProviderFault),
    } : {}),
    ...(hasCap ? {
      ...(typeof Buffer !== "undefined" ? { Buffer: harden(Buffer) } : {}),
      Float32Array: harden(globalThis.Float32Array),
      Float64Array: harden(globalThis.Float64Array),
      Uint8Array: harden(globalThis.Uint8Array),
      Uint16Array: harden(globalThis.Uint16Array),
      Uint32Array: harden(globalThis.Uint32Array),
      Uint8ClampedArray: harden(globalThis.Uint8ClampedArray),
      Int8Array: harden(globalThis.Int8Array),
      Int16Array: harden(globalThis.Int16Array),
      Int32Array: harden(globalThis.Int32Array),
      ArrayBuffer: harden(globalThis.ArrayBuffer),
      DataView: harden(globalThis.DataView),
      WebGLRenderingContext: harden((globalThis as any).WebGLRenderingContext),
      WebGL2RenderingContext: harden((globalThis as any).WebGL2RenderingContext),
      VideoFrame: harden((globalThis as any).VideoFrame),
    } : {}),
    ...(hasDomCap ? collectDomClasses() : {}),
    ...endowments,
  };

  Object.defineProperty(globals, INFORMA_GLOBAL_KEY, {
    get: () => ({
      ...Reflect.get(globalThis, INFORMA_GLOBAL_KEY),
      getGlobalStateMode: () => Reflect.get(globalThis, INFORMA_GLOBAL_KEY)?.mode,
      setGlobalStateMode: (m: string) => {
        const inf = Reflect.get(globalThis, INFORMA_GLOBAL_KEY);
        if (inf) inf.mode = m;
        return m;
      },
    }),
    set: (v) => Reflect.set(globalThis, INFORMA_GLOBAL_KEY, v),
    configurable: true,
  });

  return new Compartment({
    __options__: true,
    name,
    globals: globals as any,
    ...(resolveHook ? { resolveHook } : {}),
    ...(importHook ? { importHook } : {}),
    ...(moduleMap ? { modules: new Map(Object.entries(moduleMap)) as any } : {}),
  } as CompartmentOptions & { __options__: true });
}
