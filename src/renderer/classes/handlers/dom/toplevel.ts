import { XdgToplevel } from "@cathodique/wl-serv-high/dist/objects/xdg_toplevel.js";
import { BaseDom } from "./base.js";
import { orchestrator } from "../../../host/index.js";
import { ComponentHandle } from "../../../host/classes/component.js";

export class ToplevelDom extends BaseDom<XdgToplevel, HTMLDivElement> {
  static wlToToplevelDom = new Map<XdgToplevel, ToplevelDom>();

  instance: ComponentHandle;
  constructor(wl: XdgToplevel) {
    super(wl, document.createElement("div"));
    ToplevelDom.wlToToplevelDom.set(wl, this);

    this.instance = new (orchestrator.load("WindowFrame")!.localHandle.get("WindowFrame")!)();

    this.init();
  }

  async init () {
    this.instance.$setGeometry!(this.wl.parent.geometry.current);
    this.wl.parent.geometry.on('current', function (this: ToplevelDom) {
      this.instance.$setGeometry!(this.wl.parent.geometry.current);
    }.bind(this));

    this.instance.$setTitle!(this.wl.title);
    this.wl.on('wlSetTitle', function (this: ToplevelDom) {
      this.instance.$setTitle!(this.wl.title);
    }.bind(this));
  }
}
