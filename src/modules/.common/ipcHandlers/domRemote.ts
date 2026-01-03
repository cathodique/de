import z from "zod";
import { NodeRegistry } from "../classes/sharedDomRemote.js";
import { EventFromIpc, HandlerContext, zodEventFromIpc } from "../utils/types.js";

export class DOMRemoteHandler {
  [k: string]: (arg: Record<string, any>, ctx: HandlerContext) => any;

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

    return new EventClassObj(evtData.type, newValues);
  }

  domEmitEvent(arg: Record<string, any>) {
    return this.#domEmitEvent(z.object({
      data: z.object({
        id: z.string(),
        event: zodEventFromIpc,
      }),
    }).parse(arg));
  }
  #domEmitEvent({ data }: { data: { id: string, event: EventFromIpc } }) {
    const element = NodeRegistry.getNode(data.id);

    if (!element) return console.error(`Tried to emit event ${data.event} to inexistent element ${data.id}`);

    element.dispatchEvent(this.#deserializeEvent(data.event));
  }
};
