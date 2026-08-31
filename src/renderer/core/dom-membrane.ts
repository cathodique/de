/**
 * Transparent DOM & Object Membrane for Cathodique Desktop Environment.
 * Handles DOM single-ownership, seamless proxying, and cross-compartment marshaling.
 */

import type { DomMembraneApi } from "./types.js";

export const MEMBRANE_TARGET = Symbol.for("cathodique.membrane.target");
export const MEMBRANE_DOMAIN = Symbol.for("cathodique.membrane.domain");

export class DomMembrane implements DomMembraneApi {
  private static instance: DomMembrane;

  private nodeOwners = new WeakMap<Node, string>();
  private realToProxy = new WeakMap<Node, Map<string, any>>();
  private proxyToReal = new WeakMap<any, Node>();
  private objectProxies = new WeakMap<object, Map<string, any>>();

  private iframeDocument: Document | null = null;
  private desktopRoot: HTMLElement | null = null;

  public static getInstance(): DomMembrane {
    if (!DomMembrane.instance) DomMembrane.instance = new DomMembrane();
    return DomMembrane.instance;
  }

  public unwrapNode(nodeOrProxy: any): Node {
    if (!nodeOrProxy || typeof nodeOrProxy !== "object") return nodeOrProxy;
    if (nodeOrProxy[MEMBRANE_TARGET]) return nodeOrProxy[MEMBRANE_TARGET];
    return this.proxyToReal.get(nodeOrProxy) ?? nodeOrProxy;
  }

  public claimNode(node: Node, ownerId: string): boolean {
    if (!node || typeof node !== "object") return false;
    const realNode = this.unwrapNode(node);
    const existing = this.nodeOwners.get(realNode);
    if (existing && existing !== ownerId) {
      throw new Error(`[DOM Membrane] Node owned by '${existing}'. Module '${ownerId}' cannot claim it.`);
    }
    this.nodeOwners.set(realNode, ownerId);
    return true;
  }

  public isOwner(node: Node, ownerId: string): boolean {
    if (!node || typeof node !== "object") return false;
    return this.nodeOwners.get(this.unwrapNode(node)) === ownerId;
  }

  public getOwner(node: Node): string | undefined {
    if (!node || typeof node !== "object") return undefined;
    return this.nodeOwners.get(this.unwrapNode(node));
  }

  public canMutate(node: Node, callerId: string): boolean {
    if (!node || typeof node !== "object") return false;
    const realNode = this.unwrapNode(node);
    const owner = this.nodeOwners.get(realNode);
    if (!owner || owner === callerId) return true;
    return callerId === "@cathodique/init" || callerId === "host" || callerId === "system";
  }

  public wrapNode<T extends Node>(node: T, domainId: string): T {
    if (!node || typeof node !== "object") return node;
    const realNode = this.unwrapNode(node) as T;
    if (typeof (realNode as any).nodeType !== "number") return realNode;

    let domainMap = this.realToProxy.get(realNode);
    if (!domainMap) {
      domainMap = new Map<string, any>();
      this.realToProxy.set(realNode, domainMap);
    }
    if (domainMap.has(domainId)) return domainMap.get(domainId);

    const membrane = this;

    const handler: ProxyHandler<T> = {
      get(target: any, prop: string | symbol) {
        if (prop === MEMBRANE_TARGET) return target;
        if (prop === MEMBRANE_DOMAIN) return domainId;

        // 1. style proxying
        if (prop === "style" && target.style) {
          return new Proxy(target.style, {
            get(st, sp) {
              const val = (st as any)[sp];
              return typeof val === "function" ? val.bind(st) : val;
            },
            set(st, sp, val) {
              if (!membrane.canMutate(target, domainId)) {
                throw new Error(`[DOM Membrane] '${domainId}' cannot mutate style of node owned by '${membrane.getOwner(target)}'.`);
              }
              (st as any)[sp] = val;
              return true;
            },
          });
        }

        // 2. classList proxying
        if (prop === "classList" && target.classList) {
          return new Proxy(target.classList, {
            get(cl, cp) {
              const val = (cl as any)[cp];
              if (typeof val === "function") {
                return function (...args: any[]) {
                  if (cp === "add" || cp === "remove" || cp === "toggle" || cp === "replace") {
                    if (!membrane.canMutate(target, domainId)) {
                      throw new Error(`[DOM Membrane] '${domainId}' cannot modify classList of node owned by '${membrane.getOwner(target)}'.`);
                    }
                  }
                  return (cl as any)[cp](...args);
                };
              }
              return val;
            },
          });
        }

        // 3. Child collection & navigation
        if (prop === "children" || prop === "childNodes") {
          const col = target[prop];
          return col ? Array.from(col).map((c: any) => membrane.wrapNode(c, domainId)) : col;
        }
        if (prop === "parentNode" || prop === "parentElement" || prop === "firstChild" || prop === "lastChild" || prop === "nextSibling" || prop === "previousSibling" || prop === "shadowRoot") {
          const rel = target[prop];
          return rel ? membrane.wrapNode(rel, domainId) : rel;
        }

        // 4. Methods
        const val = target[prop];
        if (typeof val === "function") {
          return function (...args: any[]) {
            const unwrappedArgs = args.map((a) => membrane.unwrapNode(a));

            if (prop === "appendChild" || prop === "insertBefore") {
              if (!membrane.canMutate(target, domainId)) {
                throw new Error(`[DOM Membrane] '${domainId}' cannot append to node owned by '${membrane.getOwner(target)}'.`);
              }
              const child = unwrappedArgs[0];
              if (child && typeof child === "object" && child.nodeType && !membrane.getOwner(child)) {
                membrane.claimNode(child, domainId);
              }
            } else if (prop === "removeChild" || prop === "replaceChild" || prop === "setAttribute" || prop === "removeAttribute" || prop === "attachShadow") {
              if (!membrane.canMutate(target, domainId)) {
                throw new Error(`[DOM Membrane] '${domainId}' cannot mutate node owned by '${membrane.getOwner(target)}'.`);
              }
            }

            const res = target[prop](...unwrappedArgs);
            return res && typeof res === "object" && res.nodeType ? membrane.wrapNode(res, domainId) : res;
          };
        }

        return val;
      },

      set(target: any, prop: string | symbol, value: any) {
        if (!membrane.canMutate(target, domainId)) {
          throw new Error(`[DOM Membrane] '${domainId}' cannot set property '${String(prop)}' on node owned by '${membrane.getOwner(target)}'.`);
        }
        target[prop] = membrane.unwrapNode(value);
        return true;
      },
    };

    const proxy = new Proxy(realNode, handler);
    this.proxyToReal.set(proxy, realNode);
    domainMap.set(domainId, proxy);
    return proxy;
  }

  public createDocumentProxy(domainId: string, realDocument?: Document): Document | undefined {
    const doc = realDocument ?? this.iframeDocument ?? (typeof document !== "undefined" ? document : null);
    if (!doc) return undefined;

    const membrane = this;

    const handler: ProxyHandler<Document> = {
      get(target: any, prop: string | symbol) {
        if (prop === MEMBRANE_TARGET) return target;
        if (prop === MEMBRANE_DOMAIN) return domainId;

        if (prop === "createElement" || prop === "createElementNS" || prop === "createTextNode" || prop === "createDocumentFragment") {
          return function (...args: any[]) {
            const raw = target[prop](...args);
            membrane.claimNode(raw, domainId);
            return membrane.wrapNode(raw, domainId);
          };
        }

        if (prop === "importNode" || prop === "adoptNode") {
          return function (ext: any, ...rest: any[]) {
            const raw = target[prop](membrane.unwrapNode(ext), ...rest);
            membrane.claimNode(raw, domainId);
            return membrane.wrapNode(raw, domainId);
          };
        }

        if (prop === "body" || prop === "documentElement" || prop === "head" || prop === "getElementById" || prop === "querySelector" || prop === "querySelectorAll") {
          throw new Error(`[DOM Membrane] Direct access to '${String(prop)}' is restricted for security.`);
        }

        const val = target[prop];
        if (typeof val === "function") {
          return function (...args: any[]) {
            const unwrappedArgs = args.map((a) => membrane.unwrapNode(a));
            const res = target[prop](...unwrappedArgs);
            return res && typeof res === "object" && res.nodeType ? membrane.wrapNode(res, domainId) : res;
          };
        }
        return val;
      },
    };

    return new Proxy(doc, handler);
  }

  public wrap<T>(value: T, sourceDomain: string, targetDomain: string): T {
    if (sourceDomain === targetDomain || !value || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }

    const membrane = this;

    if ((value as any).nodeType) {
      return this.wrapNode(this.unwrapNode(value), targetDomain) as unknown as T;
    }

    if (typeof value === "function") {
      return function (this: any, ...args: any[]) {
        const trArgs = args.map((a) => membrane.wrap(a, targetDomain, sourceDomain));
        const res = (value as Function).apply(this, trArgs);
        if (res && typeof res.then === "function") {
          return res.then(
            (r: any) => membrane.wrap(r, sourceDomain, targetDomain),
            (e: any) => Promise.reject(membrane.wrap(e, sourceDomain, targetDomain))
          );
        }
        return membrane.wrap(res, sourceDomain, targetDomain);
      } as unknown as T;
    }

    let domainMap = this.objectProxies.get(value as object);
    if (!domainMap) {
      domainMap = new Map<string, any>();
      this.objectProxies.set(value as object, domainMap);
    }
    if (domainMap.has(targetDomain)) return domainMap.get(targetDomain);

    const proxy = new Proxy(value as object, {
      get(target, prop) {
        return membrane.wrap(Reflect.get(target, prop, target), sourceDomain, targetDomain);
      },
      set(target, prop, val) {
        return Reflect.set(target, prop, membrane.wrap(val, targetDomain, sourceDomain), target);
      },
    });

    domainMap.set(targetDomain, proxy);
    return proxy as T;
  }

  public initScriptlessIframe(iframe: HTMLIFrameElement): { document: Document; root: HTMLElement } {
    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) throw new Error("[DOM Membrane] Failed to access scriptless iframe contentDocument.");

    this.iframeDocument = iframeDoc;
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            background: #000;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          #cathodique-desktop-root {
            position: relative;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <div id="cathodique-desktop-root"></div>
      </body>
      </html>
    `);
    iframeDoc.close();

    const root = iframeDoc.getElementById("cathodique-desktop-root") as HTMLElement;
    this.desktopRoot = root;
    this.claimNode(root, "@cathodique/init");

    return {
      document: iframeDoc,
      root: this.wrapNode(root, "@cathodique/init"),
    };
  }

  public getDesktopRoot(): HTMLElement | null {
    return this.desktopRoot;
  }
}
