import z from "zod";
import { NodeRegistry } from "../classes/sharedDomRemote.js";
import { EventFromIpc, HandlerContext, zodEventFromIpc } from "../utils/types.js";
import { EventAddedEvent, EventRemovedEvent, nodeEventEvents } from "../utils/nodeEventListener.js";
import { parentIpc } from "../parentIpc.js";

export class DOMRemoteHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

  constructor() {
    nodeEventEvents.addEventListener("eventAdded", async (evt: Event) => {
      const evtTyped = evt as EventAddedEvent;

      if (!NodeRegistry.hasNode(evtTyped.target)) return;

      try {
        await parentIpc.rpc("registerEvent", {
          target: NodeRegistry.getId(evtTyped.target),
          addedEvent: evtTyped.addedEvent,
        });
      } catch { }
    });
    nodeEventEvents.addEventListener("eventRemoved", async (evt: Event) => {
      const evtTyped = evt as EventRemovedEvent;

      if (!NodeRegistry.hasNode(evtTyped.target)) return;

      try {
        await parentIpc.rpc("unregisterEvent", {
          target: NodeRegistry.getId(evtTyped.target),
          addedEvent: evtTyped.removedEvent,
        });
      } catch { }
    });
  }

  #deserializeEvent(evtData: EventFromIpc): Event {
    if (!evtData.className.endsWith("Event")) throw new Error("Constructor name must be an event");
    const EventClassObj = globalThis[evtData.className as keyof typeof globalThis] as typeof Event;

    const newValues: Record<string, any> = {};
    for (const [key, value] of Object.entries(evtData.values)) {
      if (value === undefined || ("nodeId" in value && value.nodeId === undefined)) {
        continue;
      }

      if ("nodeId" in value) {
        newValues[key] = NodeRegistry.getNode(value.nodeId);
        continue;
      }

      newValues[key] = value.value;
    }

    newValues.bubbles = false;

    return new EventClassObj(evtData.type, newValues);
  }

  domEmitEvent(arg: Record<string, any>) {
    return this.#domEmitEvent(z.object({
      data: z.object({
        target: z.string(),
        event: zodEventFromIpc,
      }),
    }).parse(arg));
  }
  #domEmitEvent({ data }: { data: { target: string, event: EventFromIpc } }) {
    const element = NodeRegistry.getNode(data.target);

    if (!element) return console.error(`Tried to emit event ${data.event} to inexistent element ${data.target}`);

    console.log(data);
    console.log(Date.now());

    element.dispatchEvent(this.#deserializeEvent(data.event));
  }
};
