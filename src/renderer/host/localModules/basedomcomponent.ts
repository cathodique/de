import { BaseObject } from "@cathodique/wl-serv-high/objects";
import { Component } from "../classes/component";
import { LocalModule } from "../classes/module";

export class BaseDomComponent<From extends BaseObject, To extends Element> extends Component {
  wl: From;
  $output: To;
  constructor(mod: LocalModule, wl: From, dom: To) {
    super(mod);
    this.wl = wl;
    this.$output = dom;
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
