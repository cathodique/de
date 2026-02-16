import { BaseObject } from "@cathodique/wl-serv-high/objects";
import { EventEmitter } from "events";

export class BaseDom<
  From extends BaseObject,
  To extends Element,
  EvtMap extends Record<string, any[]> = Record<string, any[]>,
> extends EventEmitter<EvtMap> {
  wl: From;
  dom: To;
  constructor(wl: From, dom: To) {
    super();
    this.wl = wl;
    this.dom = dom;

    this.wl.once("beforeWlDestroy", () => {
      this.destroy();
    });
  }

  unmount: (() => any)[] = [
    () => {
      this.dom.remove();
    },
  ];
  onUnmount(f: (this: this) => any) {
    this.unmount.push(f.bind(this));
  }

  destroy() {
    type yo = this;

    this.unmount.forEach(function (this: yo, v: typeof this.unmount[number]) { v.bind(this)(); }.bind(this));
  }
}
