import { ZxdgToplevelDecorationV1 } from "@cathodique/wl-serv-high/dist/objects/zxdg_decoration_manager_v1.js";

export class ZxdgToplevelDecorationManager {
  wl: ZxdgToplevelDecorationV1;
  constructor(wl: ZxdgToplevelDecorationV1) {
    this.wl = wl;

    wl.on('wlSetMode', () => {
      wl.sendToplevelDecoration('server_side');
    });
    wl.sendToplevelDecoration('server_side');
  }
}
