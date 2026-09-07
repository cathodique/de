/**
 * SES Runtime Environment setup.
 */

import type { LockdownOptions, ModuleSource } from "ses";

let isLockedDown = false;

const defaultLockdownOptions: LockdownOptions = {
  consoleTaming: "safe",
  errorTaming: "safe",
  errorTrapping: "report",
  overrideTaming: "moderate",
};

export function ensureLockdown(options: LockdownOptions = defaultLockdownOptions): void {
  if (isLockedDown) return;

  if (typeof lockdown !== "function") {
    if (typeof require !== "undefined") {
      try {
        require("ses");
      } catch {}
    }
  }

  if (typeof lockdown !== "function") {
    throw new Error("[Cathodique] Critical: SES runtime 'lockdown' is not available. Cathodique requires SES.");
  }

  const lockdownOptions: LockdownOptions = {
    ...defaultLockdownOptions,
    ...options,
  };

  if (lockdownOptions.consoleTaming === "unsafe") {
    lockdownOptions.consoleTaming = "safe";
  }
  if (lockdownOptions.errorTaming === "unsafe") {
    lockdownOptions.errorTaming = "safe";
  }

  lockdown(lockdownOptions);
  isLockedDown = true;
}

/**
 * Universal ModuleSource / StaticModuleRecord compiler compatible with SES Compartment importHook.
 */
export async function compileModuleSource(sourceCode: string, sourceUrl?: string): Promise<ModuleSource> {
  const url = sourceUrl ?? "module.js";
  if (typeof (globalThis as any).StaticModuleRecord === "function") {
    return new (globalThis as any).StaticModuleRecord(sourceCode, url);
  }
  if (typeof (globalThis as any).ModuleSource === "function") {
    return new (globalThis as any).ModuleSource(sourceCode, { sourceUrl: url });
  }

  return {
    imports: [],
    exports: [],
    reexports: [],
    __syncModuleProgram__: `${sourceCode}\n//# sourceURL=${url}`,
  } as unknown as ModuleSource;
}
