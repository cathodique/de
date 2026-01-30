import { ZxdgToplevelDecorationV1 } from "@cathodique/wl-serv-high/objects";

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
