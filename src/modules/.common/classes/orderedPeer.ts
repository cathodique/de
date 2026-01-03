import { ConsumableKeyedLatch } from "./latch.js";

import { nanoid } from "../utils/utils.js";
import { WithTransfer } from "./withTransfer.js";
import { HandlerContext } from "../utils/types.js";

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

    OrderedPeer.actualHandlers.set(source, this.orderedDecoder.bind(this));
  }

  addHandler(handler: (typeof this.handlers)[number]) {
    this.handlers.push(handler);
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
      queueMicrotask(() => {
        this.postMessage(
          {
            messages: this.pendingMessages,
            currentOrder: this.currentOrderSubmission,
          },
          this.origin,
          this.pendingTransfer,
        );

        this.pendingMessages = [];
        this.pendingTransfer = [];
        this.currentOrderSubmission += 1n;
      });
    }
  }

  async rpc(type: string, data: any | WithTransfer, obj: Record<string, any> = {}) {
    const promiseId = nanoid();
    this.post({ type, data, promiseId, ...obj });
    const result = await this.promiseMap.consume(promiseId);

    if (!result.error) return result.reply;
    throw result.error;
  }

  remainingMessages = new Map<bigint, MessageEvent[]>();
  currentOrderReception: bigint = 0n;

  originMatch(origin: string) {
    if (this.origin === '*') return true;
    if (this.origin === '/') return origin === window.origin;
    return origin === this.origin;
  }

  async orderedDecoder(evt: MessageEvent) {
    if (!this.originMatch(evt.origin)) return;

    const { data: { messages, currentOrder } } = evt;
    this.remainingMessages.set(currentOrder, messages);
    if (this.currentOrderReception === currentOrder) {
      do {
        await Promise.all(
          evt.data.messages.map(async (message: { data: any, type: string, promiseId?: string, componentHandle?: string }) => {
            const { type, promiseId } = message;

            if (type === "reply") {
              return this.promiseMap.resolve(promiseId!, message);
            }

            const handler = this.handlers.find((v) => type in v);

            if (!handler) {
              if (promiseId) this.post({ type: "reply", error: new Error("No such function"), promiseId });
              return;
            }

            try {
              const result = await handler[type](message, { ipc: this, event: evt });

              if (promiseId) {
                this.post({ type: "reply", reply: result, promiseId });
              }
            } catch (e) {
              this.post({ type: "reply", error: e, promiseId });
            }
          })
        );
        this.remainingMessages.delete(this.currentOrderReception);
        this.currentOrderReception += 1n;
      } while (this.remainingMessages.has(this.currentOrderReception));
    }
  }
}
