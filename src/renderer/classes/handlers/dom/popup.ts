import { BaseDom } from "./base.js";
import { XdgPopup } from "@cathodique/wl-serv-high/dist/objects/xdg_popup.js";

// Toplevels: context for other subsurfaces to appear in
// Popups are the same
// TODO: (to reconsider) Should Toplevels and Popups have a mother class?
export class PopupDom extends BaseDom<XdgPopup, HTMLDivElement> {
  static wlToPopupDom = new Map<XdgPopup, PopupDom>();

  constructor(wl: XdgPopup) {
    super(wl, document.createElement('div'));
    PopupDom.wlToPopupDom.set(wl, this);
  }

  async init() {

  }
}
