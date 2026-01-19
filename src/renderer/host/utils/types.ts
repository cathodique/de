import z from "zod";
import { OrderedPeer } from "../classes/orderedPeer";
import { Component, ComponentHandle } from "../classes/component";
import { ComponentInstanceProxy } from "./remoteToLocalAdapter";

export const zodElementFromIpc = z.object({
  kind: z.literal("element"),
  tagName: z.string(),
  attributes: z.array(z.tuple([ z.string().nullable(), z.string(), z.string() ])),
  children: z.array(z.string()),
  content: z.string().optional(),
});
export type ElementFromIpc = z.output<typeof zodElementFromIpc>;

export const zodTextNodeFromIpc = z.object({
  kind: z.literal("text"),
  content: z.string(),
});
export type TextNodeFromIpc = z.output<typeof zodTextNodeFromIpc>;

export const zodDocumentFragmentFromIpc = z.object({
  kind: z.literal("document_fragment"),
  children: z.array(z.string()),
});
export type DocumentFragmentFromIpc = z.output<typeof zodDocumentFragmentFromIpc>;

export const zodArbitraryNodeFromIpc = z.object({
  kind: z.literal("arbitrary"),
  nodeType: z.string(),
});
export type ArbitraryNodeFromIpc = z.output<typeof zodArbitraryNodeFromIpc>;

export const zodNodeFromIpc = z.union([
  zodElementFromIpc,
  zodTextNodeFromIpc,
  zodDocumentFragmentFromIpc,
  zodArbitraryNodeFromIpc,
]);
export type NodeFromIpc = z.output<typeof zodNodeFromIpc>;

export interface EventFromIpc {
  className: string;
  type: string;
  values: Record<string, any>;
}

export interface HandlerContext {
  ipc: OrderedPeer;
  event: MessageEvent;
}

export const componentTypes = [
  "NORMAL",
  "SINGLETON",
  "REF_ONLY",
] as const;

export type FactoryOf<T extends ComponentHandle, U extends any[]> = { create(...args: U): T | Promise<T> };
export type ComponentFactory<T extends any[] = any[]> = FactoryOf<Component, T>;
export type ComponentHandleFactory<T extends any[] = any[]> = FactoryOf<ComponentHandle, T>;
export type ComponentInstanceProxyFactory<T extends any[] = any[]> = FactoryOf<ComponentInstanceProxy, T>;

export type ClassOf<T extends ComponentHandle, U extends any[]> = (FactoryOf<T, U> | (new (...args: U) => T))
  & { type: typeof componentTypes[number], singletonInstance?: T };
export type ComponentClass<T extends any[] = any[]> = ClassOf<Component, T>;
export type ComponentHandleClass<T extends any[] = any[]> = ClassOf<ComponentHandle, T>;
export type ComponentInstanceProxyClass<T extends any[] = any[]> = ClassOf<ComponentInstanceProxy, T>;
