import { WlSurface } from "@cathodique/wl-serv-high/dist/objects/wl_surface.js";
import { PopupDom } from "./dom/popup.js";
import { ToplevelDom } from "./dom/toplevel.js";

export const objectHandlers = {
  'xdg_popup': PopupDom,
  'xdg_toplevel': ToplevelDom,
  'wl_surface': WlSurface,
  'wl_output': WlSurface,
};
