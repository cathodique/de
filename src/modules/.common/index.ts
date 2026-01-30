// NOTES FOR FUTURE USE
// TODO: TURN INTO README
// - Element lifetimes are handled by the client (this, here!)
//   Because, them being dereferenced implied it's not ref'able
//   through the DOM tree

import { OrderedPeer } from "./classes/orderedPeer.js";
import { patchAllEvents } from "./utils/nodeEventListener.js";
patchAllEvents();
OrderedPeer.registerIpcListener();

export { Component } from "./classes/component.js";
export { componentList } from "./classes/componentList.js"
export { Resolver } from "./classes/resolver.js";

const constrainLookup = new ResizeObserver((entries) => {
  requestAnimationFrame(() => {
    for (const entry of entries) {


      const targetRect = entry.target.getBoundingClientRect();

      targetRect.width, targetRect.height;
    }
  });
});

export interface ElementSetupOptions {
  constrained: boolean;
}
export function setupElement(elt: Element, options: Partial<ElementSetupOptions> = {}) {
  const sanityWrapper = document.createElement("div");

  sanityWrapper.append(elt);
  sanityWrapper.style.position = "absolute";
  sanityWrapper.style.top = "0";
  sanityWrapper.style.left = "0";

  document.body.append(sanityWrapper);

  if (options.constrained) {
    elt.setAttribute("data-constrained", "");
  }
}
