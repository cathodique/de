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

export interface EventFromIpc {
  className: string;
  type: string;
  values: Record<string, any>;
}
