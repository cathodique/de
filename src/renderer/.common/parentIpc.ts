import { OrderedPeer } from "./classes/orderedPeer.js";
import { CathodiqueConsumerHandler } from "./ipcHandlers/cathodiqueConsumer.js";
import { CathodiqueProviderHandler } from "./ipcHandlers/cathodiqueProvider.js";
import { CathodiqueRemoteHandler } from "./ipcHandlers/cathodiqueRemote.js";
import { DOMRemoteHandler } from "./ipcHandlers/domRemote.js";
import { KeyedLatch } from "./classes/latch.js";
import { componentList } from "./classes/componentList.js";

export const parentIpc = new OrderedPeer(window.parent, "*", [
  new CathodiqueConsumerHandler(new KeyedLatch()) as any,
  new CathodiqueProviderHandler(componentList) as any,
  new CathodiqueRemoteHandler(window.parent) as any,
  new DOMRemoteHandler() as any,
]);
