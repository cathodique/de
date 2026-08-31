/**
 * SES Runtime Environment setup.
 */

import type { LockdownOptions, ModuleSource } from "ses";

let isLockedDown = false;

export function ensureLockdown(options: LockdownOptions = {
  consoleTaming: "unsafe",
  errorTaming: "unsafe",
  overrideTaming: "moderate",
}): void {
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

  lockdown(options);
  isLockedDown = true;
}

/**
 * Universal ModuleSource implementation compatible with SES Compartment importHook.
 * Does not mutate globalThis after lockdown.
 */
export class UniversalModuleSource {
  public imports: string[] = [];
  public exports: string[] = [];
  public reexports: string[] = [];
  public __syncModuleProgram__: string;

  constructor(source: string, options?: string | { sourceUrl?: string }) {
    const sourceUrl = typeof options === "string" ? options : options?.sourceUrl ?? "module.js";
    this.__syncModuleProgram__ = `${source}\n//# sourceURL=${sourceUrl}`;
  }
}

export async function compileModuleSource(sourceCode: string, sourceUrl?: string): Promise<ModuleSource> {
  return new UniversalModuleSource(sourceCode, sourceUrl ? { sourceUrl } : undefined) as unknown as ModuleSource;
}
