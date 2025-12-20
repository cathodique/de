import { XdgToplevel } from "@cathodique/wl-serv-high/dist/objects/xdg_toplevel.js";
import { BaseDom } from "./base.js";
import { orchestrator } from "../../../host/index.js";
// import { Module } from "../../../host/classes/module.js";

export class ToplevelDom extends BaseDom<XdgToplevel, HTMLDivElement> {
  static wlToToplevelDom = new Map<XdgToplevel, ToplevelDom>();

  instance: Record<string, Promise<any> & ((...args: any[]) => Promise<any>)>;
  constructor(wl: XdgToplevel) {
    super(wl, document.createElement("div"));
    ToplevelDom.wlToToplevelDom.set(wl, this);

    this.instance = orchestrator.load("WindowFrame").createInstance("WindowFrame");

    this.init();
  }

  async init () {
    this.instance.rpcSetGeometry(this.wl.parent.geometry.current);
    this.wl.parent.geometry.on('current', function (this: ToplevelDom) {
      this.instance.rpcSetGeometry(this.wl.parent.geometry.current);
    }.bind(this));

    this.instance.rpcSetTitle(this.wl.title);
    this.wl.on('wlSetTitle', function (this: ToplevelDom) {
      this.instance.rpcSetTitle(this.wl.title);
    }.bind(this));
  }
}
