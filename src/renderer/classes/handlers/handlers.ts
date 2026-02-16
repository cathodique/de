import { WlSubsurface, WlSurface, XdgPopup, XdgToplevel } from "@cathodique/wl-serv-high/objects";
import { PopupDom } from "./dom/popup.js";
import { ToplevelDom } from "./dom/window_toplevel.js";
import { PolyMap } from "../../utils/polyMap.js";
import { SurfaceDom } from "./dom/surface.js";
import { SubsurfaceDom } from "./dom/subsurface.js";

export const objectHandlers = {
  'xdg_popup': PopupDom,
  'xdg_toplevel': ToplevelDom,
  'wl_surface': SurfaceDom,
  'wl_subsurface': SubsurfaceDom,
};

export const wlToObj = new PolyMap<
  | [XdgPopup, PopupDom]
  | [XdgToplevel, ToplevelDom]
  | [WlSurface, SurfaceDom]
  | [WlSubsurface, SubsurfaceDom]
>();
