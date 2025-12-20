// This file tracks lifetimes of event listeners so the host only forwards the relevant events.
// AI-gen'd. Sorry, too much stuff (capture, once), couldn't be bothered.

export const handlersMap = new WeakMap<
  Node,
  Map<
    string,
    Map<((...args: any[]) => any) | { handleEvent: (...args: any[]) => any }, number>
  >
>();

export const nodeEventEvents = new EventTarget();

class EventAddedEvent extends Event {
  addedEvent: string;
  target: Node;

  constructor(addedEvent: string, target: Node) {
    super('eventAdded');
    this.addedEvent = addedEvent;
    this.target = target;
  }
}
class EventRemovedEvent extends Event {
  removedEvent: string;
  target: Node;

  constructor(removedEvent: string, target: Node) {
    super('eventRemoved');
    this.removedEvent = removedEvent;
    this.target = target;
  }
}

export const getEventsRegisteredOnNode = (node: Node) => [...(handlersMap.get(node)?.keys() ?? [])];

function patchNodeEventListeners() {
  // Map original listener → wrapped once listener per capture
  const onceWrappers = new WeakMap<
    ((...args: any[]) => any) | { handleEvent: (...args: any[]) => any },
    [(((...a: any[]) => any) | undefined), (((...a: any[]) => any) | undefined)]
  >();

  /**
   * Bitfield explanation:
   * 1 → registered with capture: false
   * 2 → registered with capture: true
   * 3 → registered with both capture values
   */
  Node.prototype.addEventListener = function (
    type: string,
    listener: ((...args: any[]) => any) | { handleEvent: (...args: any[]) => any },
    options?: boolean | AddEventListenerOptions
  ) {
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    const once = typeof options === "object" && !!options?.once;

    let typeMap = handlersMap.get(this);
    if (!typeMap) {
      typeMap = new Map();
      handlersMap.set(this, typeMap);
    }

    let listeners = typeMap.get(type);
    if (!listeners) {
      listeners = new Map();
      typeMap.set(type, listeners);
      nodeEventEvents.dispatchEvent(new EventAddedEvent(type, this));
    }

    const existingBit = listeners.get(listener) ?? 0;
    const bit = capture ? 2 : 1;

    // Update bitfield
    listeners.set(listener, existingBit | bit);

    // Once priority: first registration for this capture wins
    let effectiveOnce = once;
    if (existingBit & bit) effectiveOnce = false;

    let actualListener = listener;

    if (effectiveOnce) {
      let captureMap = onceWrappers.get(listener);
      if (!captureMap) {
        captureMap = [undefined, undefined];
        onceWrappers.set(listener, captureMap);
      }

      if (!captureMap[+capture]) {
        actualListener = (...args: any[]) => {
          try {
            if (typeof listener === "function") listener.apply(this, args);
            else listener.handleEvent.apply(listener, args);
          } finally {
            Node.prototype.removeEventListener.call(this, type, listener, capture);
            captureMap[+capture] = undefined;
          }
        };
        captureMap[+capture] = actualListener;
      } else {
        actualListener = captureMap[+capture]!; // ...
      }
    }

    return EventTarget.prototype.addEventListener.call(this, type, actualListener as any, options);
  };

  Node.prototype.removeEventListener = function (
    type: string,
    listener: ((...args: any[]) => any) | { handleEvent: (...args: any[]) => any },
    options?: boolean | EventListenerOptions
  ) {
    const capture = typeof options === "boolean" ? options : !!options?.capture;

    let typeMap = handlersMap.get(this);
    if (typeMap) {
      let listeners = typeMap.get(type);
      if (listeners) {
        const existingBit = listeners.get(listener);

        if (existingBit) {
          const bit = capture ? 2 : 1;
          const newBit = existingBit & ~bit; // Remove capture from bitfield

          if (newBit === 0) {
            listeners.delete(listener);
            if (listeners.size === 0) {
              typeMap.delete(type);

              nodeEventEvents.dispatchEvent(new EventRemovedEvent(type, this));

              if (typeMap.size === 0) {
                handlersMap.delete(this);
              }
            }
          } else {
            listeners.set(listener, newBit);
          }
        }
      }
    }

    const captureMap = onceWrappers.get(listener);
    const actualListener = captureMap?.[+capture] ?? listener;
    if (captureMap) captureMap[+capture] = undefined;

    return EventTarget.prototype.removeEventListener.call(this, type, actualListener as any, options);
  };
}

function patchOnEvents() {
  // Collect all global constructors inheriting from Node
  const globalKeys = Reflect.ownKeys(window)
    .filter((v) => typeof v === "string" && v[0] === v[0].toUpperCase()) // class
    .filter((v) => window[v as keyof Window]) // from window
    .filter((v) => Node.isPrototypeOf(window[v as keyof Window])); // extends Node
  const nodeConstructors: Function[] = globalKeys.map((key) => (globalThis as any)[key]);

  for (const ctor of nodeConstructors) {
    const proto = ctor.prototype;
    const propNames = Object.getOwnPropertyNames(proto);

    for (const prop of propNames) {
      if (!prop.startsWith("on")) continue;

      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.configurable) continue; // skip unconfigurable

      let currentListener: ((...args: any[]) => any) | null = null;

      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: true,
        get() {
          return currentListener;
        },
        set(fn: ((...args: any[]) => any) | null) {
          console.log(fn)

          const node = this as Node;

          // Remove previous listener
          if (currentListener) {
            node.removeEventListener(prop.slice(2), currentListener);
            const typeMap = handlersMap.get(node)?.get(prop.slice(2));
            if (typeMap) typeMap.delete(currentListener);
          }

          currentListener = fn;

          if (fn) {
            // Add new listener through patched addEventListener
            node.addEventListener(prop.slice(2), fn);
          }
        }
      });
    }
  }
}

export function patchAllEvents() {
  patchNodeEventListeners();
  patchOnEvents();
}
