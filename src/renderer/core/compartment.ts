/**
 * Factory for creating SES Compartments.
 * Bridges host runtime and sandboxed compartments, ensuring Informa reactive state
 * and DOM capabilities propagate seamlessly across SES boundaries.
 */

import type { CompartmentOptions, ModuleDescriptor } from "ses";
import rawInforma from "informa";

const $ = (rawInforma as any)?.default ?? rawInforma;
const INFORMA_GLOBAL_KEY = "__INFORMA__";

export interface CreateCompartmentOptions {
  name: string;
  isInit?: boolean;
  endowments?: Record<string, unknown>;
  resolveHook?: (specifier: string, referrer: string) => string;
  importHook?: (specifier: string) => Promise<ModuleDescriptor>;
  moduleMap?: Record<string, ModuleDescriptor>;
}

export function createModuleCompartment(options: CreateCompartmentOptions): Compartment {
  const { name, isInit = false, endowments = {}, resolveHook, importHook, moduleMap } = options;

  let globals: Record<string, unknown>;

  if (isInit) {
    // Privileged Init Compartment: provides full host environment access including require and $
    globals = Object.create(globalThis);
    globals.console = typeof console !== "undefined" ? console : (globalThis as any).console;
    globals.process = typeof process !== "undefined" ? process : (globalThis as any).process;
    globals.require = typeof require !== "undefined" ? require : (globalThis as any).require;
    globals.$ = $;
    globals.setTimeout = typeof setTimeout !== "undefined" ? setTimeout.bind(globalThis) : undefined;
    globals.clearTimeout = typeof clearTimeout !== "undefined" ? clearTimeout.bind(globalThis) : undefined;
    globals.setInterval = typeof setInterval !== "undefined" ? setInterval.bind(globalThis) : undefined;
    globals.clearInterval = typeof clearInterval !== "undefined" ? clearInterval.bind(globalThis) : undefined;

    for (const [key, value] of Object.entries(endowments)) {
      Object.defineProperty(globals, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  } else {
    // Sandboxed Guest Compartment with $ and safe host module require available
    globals = {
      $: $,
      require: (specifier: string) => {
        if (specifier === "informa") return $;
        throw new Error(`[Sandboxed Compartment '${name}'] Cannot require('${specifier}').`);
      },
      Date: typeof Date !== "undefined" ? Date : undefined,
      Math: typeof Math !== "undefined" ? Math : undefined,
      console: {
        log: (...args: unknown[]) => console.log(`[${name}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[${name}]`, ...args),
        error: (...args: unknown[]) => console.error(`[${name}]`, ...args),
        info: (...args: unknown[]) => console.info(`[${name}]`, ...args),
        debug: (...args: unknown[]) => console.debug(`[${name}]`, ...args),
      },
      setTimeout: typeof setTimeout !== "undefined" ? setTimeout.bind(globalThis) : undefined,
      clearTimeout: typeof clearTimeout !== "undefined" ? clearTimeout.bind(globalThis) : undefined,
      setInterval: typeof setInterval !== "undefined" ? setInterval.bind(globalThis) : undefined,
      clearInterval: typeof clearInterval !== "undefined" ? clearInterval.bind(globalThis) : undefined,
      ...endowments,
    };
  }

  // Pre-wire single __INFORMA__ key on globals
  Object.defineProperty(globals, INFORMA_GLOBAL_KEY, {
    get() {
      return Reflect.get(globalThis, INFORMA_GLOBAL_KEY);
    },
    set(v) {
      Reflect.set(globalThis, INFORMA_GLOBAL_KEY, v);
    },
    configurable: true,
    enumerable: false,
  });

  const compartmentOptions: CompartmentOptions & { __options__: true } = {
    __options__: true,
    name,
    globals: globals as any,
  };

  if (resolveHook) compartmentOptions.resolveHook = resolveHook;
  if (importHook) compartmentOptions.importHook = importHook;
  if (moduleMap) compartmentOptions.modules = new Map(Object.entries(moduleMap)) as any;

  const compartment = new Compartment(compartmentOptions);

  // Wire __INFORMA__ onto compartment.globalThis
  try {
    Object.defineProperty(compartment.globalThis, INFORMA_GLOBAL_KEY, {
      get() {
        return Reflect.get(globalThis, INFORMA_GLOBAL_KEY);
      },
      set(v) {
        Reflect.set(globalThis, INFORMA_GLOBAL_KEY, v);
      },
      configurable: true,
      enumerable: false,
    });
  } catch {}

  return compartment;
}
