import z from "zod";
import { OrderedPeer } from "../classes/orderedPeer";
import { Component, ComponentHandle } from "../classes/component";
import { ComponentInstanceProxy } from "./remoteToLocalAdapter";

export interface ElementFromIpc {
  kind: "element";
  tagName: string;
  attributes: [string | null, string, string][];
  children: string[];
  content?: string;
}

export interface TextNodeFromIpc {
  kind: "text";
  content: string;
}

export interface DocumentFragmentFromIpc {
  kind: "document_fragment";
  children: string[];
}

export interface ArbitraryNodeFromIpc {
  kind: "arbitrary";
  nodeType: string;
}

export type NodeFromIpc = ElementFromIpc | TextNodeFromIpc | DocumentFragmentFromIpc | ArbitraryNodeFromIpc;

export const zodEventFromIpc = z.object({
  className: z.string(),
  type: z.string(),
  values: z.record(z.string(), z.any()),
});
export type EventFromIpc = z.output<typeof zodEventFromIpc>;

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

// Class is what it might be for users
export type ClassOf<T extends ComponentHandle, U extends any[]> = (FactoryOf<T, U> | (new (...args: U) => T))
  & { type: typeof componentTypes[number], singletonInstance?: T };
export type ComponentClass<T extends any[] = any[]> = ClassOf<Component, T>;
export type ComponentHandleClass<T extends any[] = any[]> = ClassOf<ComponentHandle, T>;
export type ComponentInstanceProxyClass<T extends any[] = any[]> = ClassOf<ComponentInstanceProxy, T>;
