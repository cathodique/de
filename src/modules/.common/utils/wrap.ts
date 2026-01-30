import z from "zod";
import { Component } from "../classes/component";
import { componentList } from "../classes/componentList";
import { SharedDOM } from "../classes/sharedDomRemote";
import { ComponentInstanceProxy, makeComponentProxy } from "./remoteToLocalAdapter";
import { RemoteModule } from "../classes/module";
import { DummyNodeRegistry } from "../classes/sharedDomDummy";
import { moduleId } from "../ipcHandlers/cathodiqueRemote";
import { OrderedPeer } from "../classes/orderedPeer";

export const zodWrappedValue = z.union([
  z.object({
    type: z.literal("component"),
    componentName: z.string(),
    componentId: z.string(),
    moduleId: z.string(),
  }),
  z.object({
    type: z.literal("node"),
    nodeId: z.string(),
  }),
  z.object({
    value: z.any(),
  }),
]);
export type WrappedValue = z.output<typeof zodWrappedValue>;

export async function wrapValue(value: any): Promise<z.output<typeof zodWrappedValue>> {
  const isComponent = (v: any): v is (Component | ComponentInstanceProxy) => v?.[Component.isComponentSymbol];
  if (isComponent(value)) {
    const isRemote = "module" in value;

    return {
      type: "component",
      componentName: isRemote ? value.componentName : componentList.componentTypeOf(value),
      componentId: isRemote ? await value.componentId : value.componentId,
      moduleId: isRemote ? value.module.id : await moduleId,
    };
  }

  if (value instanceof Node) {
    const nodeId = await SharedDOM.initOrGet(value);

    return {
      type: "node",
      nodeId,
    };
  }

  return { value };
}

export async function unwrapValue(value: any, peer: OrderedPeer) {
  const wrapped = zodWrappedValue.parse(value);

  if (!("type" in wrapped)) return wrapped.value;

  switch (wrapped.type) {
    case "component":
      const moduleId = wrapped.moduleId;
      if (!moduleId) return undefined;
      const module = await RemoteModule.moduleByOpaqueToken(moduleId);

      if (!module || !(await module?.instanceExists(wrapped.componentId))) {
        return undefined;
      }
      return makeComponentProxy(module, wrapped.componentName, { componentId: wrapped.componentId });
    case "node":
      return await DummyNodeRegistry.registryOf(peer)!.getNode(value.nodeId);
  }
}
