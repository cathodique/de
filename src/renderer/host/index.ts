import { Orchestrator } from "./classes/orchestrator.js";
import { OrderedPeer } from "./classes/orderedPeer.js";

OrderedPeer.registerIpcListener();

export const orchestrator = new Orchestrator();
