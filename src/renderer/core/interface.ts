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

// Built-in standard interfaces
export const InitInterface = defineInterface({
  name: "@cathodique/init-iface",
  version: "1.0.0",
  description: "Desktop Environment Privileged Bootstrapper & Spawner Interface",
  exportMap: {
    init: { type: "function", required: true },
    default: { type: "any", required: false },
  },
});

export const LayerLoaderInterface = defineInterface({
  name: "@cathodique/layer-iface",
  version: "1.0.0",
  description: "Compositor Layer Management Interface",
  exportMap: {
    createLayer: { type: "function", required: true },
    getLayer: { type: "function", required: true },
    listLayers: { type: "function", required: true },
  },
});

export const WindowManagerInterface = defineInterface({
  name: "@cathodique/wm-iface",
  version: "1.0.0",
  description: "Window Management and Workspace Interface",
  exportMap: {
    createWindow: { type: "function", required: true },
    manageWindow: { type: "function", required: false },
    closeWindow: { type: "function", required: true },
    listWindows: { type: "function", required: true },
    getWorkspaceElement: { type: "function", required: false },
  },
});

export const ServiceInterface = defineInterface({
  name: "@cathodique/service-iface",
  version: "1.0.0",
  description: "Background Service Daemon Interface",
  exportMap: {
    start: { type: "function", required: true },
    stop: { type: "function", required: true },
    status: { type: "function", required: false },
  },
});

export const LoaderInterface = defineInterface({
  name: "@cathodique/loader-iface",
  version: "1.0.0",
  description: "Module Loader Interface",
  exportMap: {
    loadModule: { type: "function", required: true },
    spawn: { type: "function", required: true },
    resolve: { type: "function", required: true },
  },
});
