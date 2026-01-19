import { WlSubsurface, WlSurface, XdgPopup, XdgToplevel } from "@cathodique/wl-serv-high/objects";
import { PopupDom } from "./dom/popup.js";
import { ToplevelDom } from "../../host/localModules/window_toplevel.js";
import { PolyMap } from "../../host/classes/polymap.js";
import { SurfaceDom } from "./dom/surface.js";
import { Subsurface } from "./lib/subsurface.js";

export const objectHandlers = {
  'xdg_popup': PopupDom,
  'xdg_toplevel': ToplevelDom,
  'wl_surface': SurfaceDom,
  'wl_subsurface': Subsurface
};

export const wlToObj = new PolyMap<
  | [XdgPopup, PopupDom]
  | [XdgToplevel, ToplevelDom]
  | [WlSurface, SurfaceDom]
  | [WlSubsurface, Subsurface]
>();
