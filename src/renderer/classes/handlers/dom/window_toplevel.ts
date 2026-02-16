import { XdgToplevel } from "@cathodique/wl-serv-high/objects";
import { wlToObj } from "../handlers.js";
import { BaseDom } from "./base.js";
import { EventEmitter } from "events";

class WindowRegistry extends EventEmitter<{"newWindow": [ToplevelDom]}> {
  static instance: WindowRegistry;
  static {
    this.instance = new WindowRegistry();
  }

  constructor() {
    if (WindowRegistry.instance) throw new Error("Can't create multiple WindowRegistries");
    super();
    WindowRegistry.instance = this;
  }

  addWindow(window: ToplevelDom) {
    this.emit("newWindow", window);
  }
}
export const windowRegistry = WindowRegistry.instance;

export const wlToToplevelDom = new Map<XdgToplevel, ToplevelDom>();

export class ToplevelDom extends BaseDom<XdgToplevel, HTMLDivElement> {
  get surfaceDom() {
    return wlToObj.get(this.wl.parent.surface)!;
  }

  constructor(wl: XdgToplevel) {
    super(wl, document.createElement("div"));
    this.dom.append(this.surfaceDom.dom);

    WindowRegistry.instance.addWindow(this);

    wlToToplevelDom.set(wl, this);
  }

  get $geometry() { return this.wl.parent.geometry.current }
  async init () {
    this.emit("setGeometry", this.$geometry);
    this.wl.parent.geometry.on("current", () => {
      this.emit("setGeometry", this.$geometry);
    });

    this.emit("setTitle", this.wl.title);
    this.wl.on("wlSetTitle", () => {
      this.emit("setTitle", this.wl.title);
    });
  }
}
