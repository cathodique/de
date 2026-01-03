import z from "zod";
import { Component } from "../classes/component";
import { componentList } from "../classes/componentList";
import { SharedDOM } from "../classes/sharedDomRemote";
import { ComponentInstanceProxy, makeComponentProxy } from "./remoteToLocalAdapter";
import { RemoteModule } from "../classes/module";
import { DummyNodeRegistry } from "../classes/sharedDomDummy";

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
    const isRemote = "module" in value;

    return {
      type: "component",
      componentName: isRemote ? value.componentName : componentList.componentTypeOf(value),
      componentId: isRemote ? await value.componentId : value.componentId,
      moduleId: isRemote ? value.module.id : undefined,
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

export function unwrapValue(value: any, fromModule: RemoteModule | undefined) {
  const wrapped = zodWrappedValue.parse(value);

  if (!("type" in wrapped)) return wrapped.value;

  switch (wrapped.type) {
    case "component":
      const moduleId = wrapped.moduleId || fromModule?.id;
      if (!moduleId) return undefined;
      const module = RemoteModule.moduleById(moduleId);
      if (!module?.componentExists(wrapped.componentId)) {
        return undefined;
      }
      return makeComponentProxy(module, wrapped.componentName, { componentId: wrapped.componentId });
    case "node":
      return DummyNodeRegistry.registryOf(fromModule?.peer.source || window.parent)!.getNode(value.nodeId);
  }
}
