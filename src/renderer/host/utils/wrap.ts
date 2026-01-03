import z from "zod";
import { Component } from "../classes/component";
import { SharedDOM } from "../classes/sharedDomHost";
import { ComponentInstanceProxy } from "./remoteToLocalAdapter";
import { BaseModule, RemoteModule } from "../classes/module";
import { OtherNodeRegistry } from "../classes/sharedDomHost";

export const zodWrappedValue = z.union([
  z.object({
    value: z.any(),
  }),
  z.object({
    type: z.literal("component"),
    componentName: z.string(),
    componentId: z.string(),
    moduleId: z.string().optional(), // undefined => This module comes from myself
  }),
  z.object({
    type: z.literal("node"),
    nodeId: z.string(),
  }),
]);
export type WrappedValue = z.output<typeof zodWrappedValue>;

export async function wrapValue(value: any): Promise<z.output<typeof zodWrappedValue>> {
  const isComponent = (v: any): v is (Component | ComponentInstanceProxy) => v[Component.isComponentSymbol];
  if (isComponent(value)) {
    const isRemote = "componentName" in value;

    return {
      type: "component",
      componentName: isRemote ? value.componentName : value.module.localHandle.componentTypeOf(value),
      componentId: isRemote ? await value.componentId : value.componentId,
      moduleId: value.module.opaqueToken,
    };
  }

  if (value instanceof Node) {
    const nodeId = SharedDOM.initOrGet(value);

    return {
      type: "node",
      nodeId,
    };
  }

  return { value };
}

export async function unwrapValue(value: any, fromModule: RemoteModule) {
  const wrapped = zodWrappedValue.parse(value);

  if (!("type" in wrapped)) return wrapped.value;

  switch (wrapped.type) {
    case "component":
      const moduleId = wrapped.moduleId || fromModule.opaqueToken;
      const module = BaseModule.moduleById(moduleId);
      if (!module?.componentExists(wrapped.componentId)) {
        return undefined;
      }
      // if (module instanceof remote)
      // return makeComponentProxy(module, wrapped.componentName, wrapped.componentId);
    case "node":
      return OtherNodeRegistry.registryOf((await fromModule.peer).source)!.getNode(value.nodeId);
  }
}
