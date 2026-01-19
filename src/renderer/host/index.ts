// esbuild... tf u doing,,,,
import "../classes/handlers/handlers.js";

import { OrderedPeer } from "./classes/orderedPeer.js";

OrderedPeer.registerIpcListener();

import "./localModules/loadAllLocalModules.js";

import { orchestrator } from "./classes/orchestrator.js";

export { orchestrator };
