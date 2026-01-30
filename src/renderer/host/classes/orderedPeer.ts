import { ConsumableKeyedLatch } from "./latch.js";

import { nanoid } from "../utils/utils.js";
import { WithTransfer } from "./withTransfer.js";
import { HandlerContext } from "../utils/types.js";

// TODO ASAP: Allow for promise MessageEventSource

export class OrderedPeer {
  handlers: Record<string, (data: Record<string, any>, ctx: HandlerContext) => any>[] = [];

  static actualHandlers = new WeakMap<MessageEventSource, (evt: MessageEvent) => void>();
  private static registered = false;
  static registerIpcListener() {
    if (this.registered) return;
    window.addEventListener(
      "message",
      (evt) => {
        const actualHandler = this.actualHandlers.get(evt.source as MessageEventSource);
        if (!actualHandler) return;
        actualHandler(evt);
      },
    );
    this.registered = true;
  }

  currentOrderSubmission: bigint = 0n;
  pendingMessages: any[] = [];
  pendingTransfer: Transferable[] = [];
  origin: string;

  promiseMap = new ConsumableKeyedLatch<string, any>();

  source: MessageEventSource;
  postMessage: typeof window["postMessage"];
  constructor(source: MessageEventSource, origin = "*") {
    if (OrderedPeer.actualHandlers.has(source)) throw new Error("A window may only admit a single OrderedPeer");

    this.source = source;
    this.postMessage = source.postMessage.bind(source);
    this.origin = origin;

    if (source instanceof MessagePort) {
      if (origin !== "*") throw new Error("Cannot restrain origin if source is a MessagePort");
      source.addEventListener("message", this.orderedDecoder.bind(this));
    } else {
      OrderedPeer.actualHandlers.set(source, this.orderedDecoder.bind(this));
    }
  }

  addHandler(handler: (typeof this.handlers)[number]) {
    this.handlers.push(handler);
    if (this.source instanceof MessagePort) this.source.start();
    return this; // Builder
  }

  post(data: any) {
    let transfer: WithTransfer[] = [];
    if (data instanceof WithTransfer) {
      transfer = data.transfer;
      data = data.data;
    }

    this.pendingMessages.push(data);
    this.pendingTransfer.push(...transfer);

    if (this.pendingMessages.length === 1) {
      const error = new Error().stack!;
      queueMicrotask(() => {
        if (error.length < 1) {
          throw new Error("Just to get the stack trace.");
        }
        this.source.postMessage(
          {
            messages: this.pendingMessages,
            currentOrder: this.currentOrderSubmission,
          },
          {
            targetOrigin: this.origin,
            transfer: this.pendingTransfer,
          }
        );

        this.pendingMessages = [];
        this.pendingTransfer = [];
        this.currentOrderSubmission += 1n;
      });
    }
  }

  async rpc(type: string, oldData: any | WithTransfer, obj: Record<string, any> = {}) {
    const promiseId = nanoid();
    const { data, transfer } = new WithTransfer(oldData);
    // console.log(window.origin, "RPC WITH", promiseId, type, data, transfer);
    this.post(new WithTransfer({ type, data, promiseId, ...obj }, transfer));
    const result = await this.promiseMap.consume(promiseId);
    // console.log(window.origin, "RPC WAS ALL GOOD!", promiseId, type, result);

    if (!result.error) return result.reply;
    throw result.error;
  }

  remainingMessages = new Map<bigint, MessageEvent[]>();
  currentOrderReception: bigint = 0n;

  originMatch(evt: MessageEvent) {
    if (evt.origin === "" && this.source instanceof MessagePort) return true;

    if (this.origin === '*') return true;
    if (this.origin === '/') return evt.origin === window.origin;
    return evt.origin === this.origin;
  }

  async orderedDecoder(evt: MessageEvent) {
    if (!this.originMatch(evt)) return;

    const { data: { messages, currentOrder } } = evt;
    // this.remainingMessages.set(currentOrder, messages);

    // while (this.remainingMessages.has(this.currentOrderReception)) {
    //   const messages = this.remainingMessages.get(this.currentOrderReception)!;
    //   this.remainingMessages.delete(this.currentOrderReception);
    //   this.currentOrderReception += 1n;

      // Used to be await Promise.all.
      // Trying to prevent deadlock here...
      messages.map(async (message: { data: any, type: string, error?: string, promiseId?: string, componentHandle?: string }) => {
        const { type, promiseId } = message;

        if (type === "reply") {
          this.promiseMap.resolve(promiseId!, message);
          if (message.error) throw message.error;

          return;
        }

        const handler = this.handlers.find((v) => type in v);

        if (!handler) {
          console.error("Client attempted", type, "which was not impl'd");
          if (promiseId) this.post({ type: "reply", error: new Error("No such function"), promiseId });
          return;
        }

        try {
          const result = new WithTransfer(await handler[type](message, { ipc: this, event: evt }));

          if (promiseId) {
            this.post(new WithTransfer({ type: "reply", reply: result.data, promiseId }, result.transfer));
          }
        } catch (e) {
          console.error(e);
          this.post({ type: "reply", error: (e as Error).toString(), promiseId });
        }
      });
    // }
  }
}
