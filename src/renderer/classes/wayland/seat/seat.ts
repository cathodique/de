import { SeatConfiguration, SeatInstances, SeatRegistry } from "@cathodique/wl-serv-high/registries";
import { Modifiers } from "./modifiers.js";
import { codeToScan } from "./codeToScancode.js";
import { SurfaceDom } from "../../handlers/dom/surface.js";
import { isInRegion } from "../../../wayland/index.js";
import { Reactive } from "@cathodique/wl-serv-high/lib";

export class Seat {
  static mouseWebToButtonMap: Record<string, number> = {
    0: 0x110,
    1: 0x112,
    2: 0x111,
    3: 0x116,
    4: 0x115,
  };

  wlSeatReg: SeatRegistry;
  config: Reactive<SeatConfiguration>;
  get wlSeatAuth() {
    const result = this.wlSeatReg.get(this.config);
    if (!result) throw new Error();
    return result;
  }

  keyboardFocus?: { instances: SeatInstances, surface: SurfaceDom };

  mouseFocus?: { instances: SeatInstances, surface: SurfaceDom };

  modifiers: Modifiers;
  constructor(config: Reactive<SeatConfiguration>, seatReg: SeatRegistry) {
    this.wlSeatReg = seatReg;
    this.config = config;
    this.modifiers = new Modifiers(this);

    this.initKeydown();
    this.initKeyup();
  }

  initKeyup() {
    document.body.addEventListener("keyup", function (this: Seat, v: KeyboardEvent) {
      if (!this.keyboardFocus) {
        this.modifiers.updateAccordingly(v);
        return;
      }
      v.preventDefault();
      this.modifiers.ifUpdateThenEmit(v, this.keyboardFocus.instances.connection);

      const isInMap = (code: string): code is keyof typeof codeToScan =>
        code in codeToScan;
      if (!isInMap(v.code)) return;

      const scancode = codeToScan[v.code];

      this.keyboardFocus.instances.keyUp(scancode);
    }.bind(this));
  }

  initKeydown() {
    document.body.addEventListener("keydown", (v) => {
      if (!this.keyboardFocus) {
        this.modifiers.updateAccordingly(v);
        return;
      }
      v.preventDefault();
      this.modifiers.ifUpdateThenEmit(v, this.keyboardFocus.instances.connection);

      const isInMap = (code: string): code is keyof typeof codeToScan =>
        code in codeToScan;
      if (!isInMap(v.code)) return;

      const scancode = codeToScan[v.code];

      this.keyboardFocus.instances.keyDown(scancode);
    });
  }

  setMouseFocus(surface: SurfaceDom) {
    this.mouseFocus = {
      surface,
      instances: this.wlSeatAuth.get(surface.wl.connection)!,
    };
  }
  unsetMouseFocus() {
    this.mouseFocus?.instances.blur(this.mouseFocus.surface.wl);
    this.mouseFocus?.instances.leave(this.mouseFocus.surface.wl);
    this.mouseFocus = undefined;
  }

  setKeyboardFocus(surface: SurfaceDom) {
    this.keyboardFocus = {
      surface,
      instances: this.wlSeatAuth.get(surface.wl.connection)!,
    };
  }
  unsetKeyboardFocus() { this.keyboardFocus = undefined; }

  move(evt: MouseEvent, surface: SurfaceDom, forceLeave?: boolean) {
    // (obj.xdgSurface?.parent as XdgWmBase)?.addCommand("ping", {
    //   serial: obj.connection.time.getTime(),
    // });
    // We'll see abt that later

    const containerPos = surface.dom.getBoundingClientRect();

    const mouseY = evt.clientY - containerPos.top;
    const mouseX = evt.clientX - containerPos.left;

    evt.stopPropagation();

    if (
      !forceLeave &&
      isInRegion(surface.wl.inputRegions.current, mouseY, mouseX, true)
    ) {
      // We are in the region and not looking to leave
      if (this.mouseFocus?.surface !== surface) {
        this.setMouseFocus(surface);
        // We are currently focusing a surface that is not ours
        this.mouseFocus!.instances = this.wlSeatAuth.get(surface.wl.connection)!;
        const enterSerial = this.mouseFocus!.instances.focus(surface.wl, []);
        this.modifiers.update(this.mouseFocus!.instances.connection, enterSerial);
        this.mouseFocus!.instances.enter(surface.wl, mouseX, mouseY);
        // ?????
      }
      this.mouseFocus?.instances.moveTo(mouseX, mouseY);
    }
  }
}
