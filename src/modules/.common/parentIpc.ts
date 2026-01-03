import { OrderedPeer } from "./classes/orderedPeer.js";
import { CathodiqueProviderHandler } from "./ipcHandlers/cathodiqueProvider.js";
import { CathodiqueRemoteHandler } from "./ipcHandlers/cathodiqueRemote.js";
import { DOMRemoteHandler } from "./ipcHandlers/domRemote.js";
import { canonicalHost } from "./utils/utils.js";

// We are removing the * for now because
// we would rather trust the parent.
// TODO expose public handle with API.
const parentIpc = new OrderedPeer(window.parent, canonicalHost);
parentIpc.addHandler(new CathodiqueRemoteHandler());
parentIpc.addHandler(new CathodiqueProviderHandler(undefined));
parentIpc.addHandler(new DOMRemoteHandler());

export { parentIpc };
