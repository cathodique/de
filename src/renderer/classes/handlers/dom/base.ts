import { BaseObject } from "@cathodique/wl-serv-high/objects";

export class BaseDom<From extends BaseObject, To extends Element> {
  wl: From;
  dom: To;
  constructor(wl: From, dom: To) {
    this.wl = wl;
    this.dom = dom;
  }

  unmount: (() => any)[] = [];
  onUnmount(f: (this: this) => any) {
    this.unmount.push(f.bind(this));
  }

  destroy() {
    type yo = this;

    this.unmount.forEach(function (this: yo, v: typeof this.unmount[number]) { v.bind(this)(); }.bind(this));
  }
}
