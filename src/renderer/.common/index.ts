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
