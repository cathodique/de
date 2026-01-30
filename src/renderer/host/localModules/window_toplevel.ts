import { XdgToplevel } from "@cathodique/wl-serv-high/objects";
import { BaseDomComponent } from "./basedomcomponent.js";
import { LocalModule } from "../classes/module.js";
import { Component } from "../classes/component";
import { componentTypes } from "../utils/types.js";
import { wlToObj } from "../../classes/handlers/handlers.js";

const windowModule = LocalModule.setupModule("Cathodique::Window");

class WindowRegistry extends Component {
  static type: typeof componentTypes[number] = "SINGLETON";
  static singletonInstance?: WindowRegistry;

  constructor(mod: LocalModule) {
    super(mod);
  }

  addWindow(window: ToplevelDom) {
    this.emit("newWindow", window);
  }
}
WindowRegistry.singletonInstance = new WindowRegistry(windowModule);

export const wlToToplevelDom = new Map<XdgToplevel, ToplevelDom>();

export class ToplevelDom extends BaseDomComponent<XdgToplevel, HTMLDivElement> {
  static type: typeof componentTypes[number] = "REF_ONLY";

  get surfaceDom() {
    return wlToObj.get(this.wl.parent.surface)!;
  }

  constructor(wl: XdgToplevel) {
    super(windowModule, wl, document.createElement("div"));
    this.$output.append(this.surfaceDom.dom);

    WindowRegistry.singletonInstance!.addWindow(this);

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

windowModule.localHandle.register("Window", ToplevelDom);
windowModule.localHandle.register("WindowRegistry", WindowRegistry);
windowModule.localHandle.markReady();

export { windowModule };
