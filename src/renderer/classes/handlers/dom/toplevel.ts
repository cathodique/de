import { XdgToplevel } from "@cathodique/wl-serv-high/objects";
import { BaseDom } from "./base.js";
import { orchestrator } from "../../../host/index.js";
import { ComponentHandle } from "../../../host/classes/component.js";
import { BaseModule, LocalModule } from "../../../host/classes/module.js";

export class ToplevelDom extends BaseDom<XdgToplevel, HTMLDivElement> {
  static wlToToplevelDom = new Map<XdgToplevel, ToplevelDom>();

  static async create(wl: XdgToplevel) {
    const windowFrame = await orchestrator.load("WindowFrame");
    if (!windowFrame) throw new Error("Expected existing WindowFrame");

    return new this(wl, windowFrame);
  }

  instance: ComponentHandle;
  private constructor(wl: XdgToplevel, windowFrameModule: BaseModule) {
    super(wl, document.createElement("div"));
    ToplevelDom.wlToToplevelDom.set(wl, this);

    this.instance = new (windowFrameModule.localHandle.get("WindowFrame")!)();

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
