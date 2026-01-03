import z from "zod";
import { OrderedPeer } from "../classes/orderedPeer";

export interface ElementFromIpc {
  kind: "element";
  tagName: string;
  attributes: [string, string, string][];
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
