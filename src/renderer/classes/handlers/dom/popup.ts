import { BaseDom } from "./base.js";
import { XdgPopup } from "@cathodique/wl-serv-high/objects";
import { wlToObj } from "../handlers.js";

// Toplevels: context for other subsurfaces to appear in
// Popups are the same
// TODO: (to reconsider) Should Toplevels and Popups have a mother class?
export class PopupDom extends BaseDom<XdgPopup, HTMLDivElement> {
  constructor(wl: XdgPopup) {
    super(wl, document.createElement('div'));
    wlToObj.set(wl, this);
  }

  // async init() {
  //   const posOfPopup = this.wl.meta.positioner.positionWithinOutputAndStruts();
  // }
}
