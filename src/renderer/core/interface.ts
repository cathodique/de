/**
 * Interface contract definitions and export map validation.
 */

import type {
  ExportRequirement,
  ExportType,
  InterfaceDefinition,
  InterfaceExportMap,
} from "./types.js";

const interfaceRegistry = new Map<string, InterfaceDefinition<any>>();

export function defineInterface<T = unknown>(definition: InterfaceDefinition<T>): InterfaceDefinition<T> {
  if (!definition.name) throw new Error("Interface definition must have a 'name'.");
  const fullDef: InterfaceDefinition<T> = {
    type: "interface",
    ...definition,
  };
  interfaceRegistry.set(definition.name, fullDef);
  return fullDef;
}

export function getInterface<T = unknown>(name: string): InterfaceDefinition<T> | undefined {
  return interfaceRegistry.get(name) as InterfaceDefinition<T> | undefined;
}

export function listInterfaces(): InterfaceDefinition<any>[] {
  return Array.from(interfaceRegistry.values());
}

function matchesExportType(value: unknown, expectedType: ExportType): boolean {
  if (expectedType === "any") return true;
  if (expectedType === "class") {
    return typeof value === "function" && Boolean(value.prototype) && value.prototype.constructor === value;
  }
  if (expectedType === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  return typeof value === expectedType;
}

export function validateModuleExports(
  exportsNamespace: Record<string, unknown>,
  interfaceDef: InterfaceDefinition<any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [exportName, ruleOrType] of Object.entries(interfaceDef.exportMap)) {
    const req: ExportRequirement = typeof ruleOrType === "string"
      ? { type: ruleOrType, required: true }
      : { required: true, ...ruleOrType };

    const isRequired = req.required !== false;
    const value = exportsNamespace[exportName];

    if (value === undefined) {
      if (isRequired) {
        errors.push(`Missing required export '${exportName}' (${req.type}) for '${interfaceDef.name}'.`);
      }
      continue;
    }

    if (!matchesExportType(value, req.type)) {
      errors.push(`Export '${exportName}' has invalid type: expected '${req.type}', got '${typeof value}' for '${interfaceDef.name}'.`);
    }

    if (req.validate) {
      try {
        const customRes = req.validate(value);
        if (customRes === false) errors.push(`Validation failed for '${exportName}' on '${interfaceDef.name}'.`);
        else if (typeof customRes === "string") errors.push(customRes);
      } catch (err: any) {
        errors.push(`Validator error for '${exportName}': ${err?.message ?? err}`);
      }
    }
  }

  if (interfaceDef.validate) {
    try {
      const overall = interfaceDef.validate(exportsNamespace);
      if (overall === false) errors.push(`Failed overall validation for '${interfaceDef.name}'.`);
      else if (typeof overall === "string") errors.push(overall);
    } catch (err: any) {
      errors.push(`Interface validator threw: ${err?.message ?? err}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
