import z from "zod";
import { OrderedPeer } from "../classes/orderedPeer";

export const zodElementFromIpc = z.object({
  kind: z.literal("element"),
  tagName: z.string(),
  attributes: z.tuple([ z.string(), z.string(), z.string() ]),
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

export type ComponentClass = new (...a: any[]) => Component;
export type ComponentHandleClass = new (...a: any[]) => ComponentHandle;
