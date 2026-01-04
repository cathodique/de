import { WlSurface } from "@cathodique/wl-serv-high/objects";
import { Seat } from "../../wayland/seat/seat.js";
import { BaseDom } from "./base.js";
import { Output } from "../../wayland/output/output.js";

// HEY JULIETTE!! THIS IS WHERE WE AT
// WE NEED TO CREATE THE ACTUAL COMPONENT, THEN HOOK IT UP!!

export class SurfaceDom extends BaseDom<WlSurface, HTMLCanvasElement> {
  static wlToSurfaceDom = new Map<WlSurface, SurfaceDom>();

  ctx: CanvasRenderingContext2D;
  constructor(wl: WlSurface) {
    super(wl, document.createElement("canvas"));
    SurfaceDom.wlToSurfaceDom.set(wl, this);

    const ctx = this.dom.getContext("2d");
    if (!ctx)
      throw new Error(
        "Failed to derive 2d context from canvas element; is anything disabled?",
      );
    this.ctx = ctx;
  }

  shownOnOutputs = new Set<Output>();

  init() {
    let lastDimensions: [number, number] = [-Infinity, -Infinity];
    const commitHandler = async function (this: SurfaceDom) {
      const b = this.wl.buffer.current;

      if (b === null) this.dom.style.display = "none";
      if (b == null) return;

      if (lastDimensions[0] !== b.meta.height || lastDimensions[1] !== b.meta.width) {
        this.dom.width = b.meta.width;
        this.dom.height = b.meta.height;
        lastDimensions = [b.meta.height, b.meta.width];
      }

      const currlyDamagedBuffer = this.wl.getCurrlyDammagedBuffer();

      for (const rect of currlyDamagedBuffer) {
        b.updateBufferArea(rect.y, rect.x, rect.h, rect.w)
      }
      const arr = new Uint8ClampedArray(
        b.buffer.buffer as ArrayBuffer,
        0,
        b.meta.width * b.meta.height * 4,
      );
      if (arr.length > 0) {
        let imageData = new ImageData(arr, b.meta.width, b.meta.height);

        for (const rect of currlyDamagedBuffer) {
          this.ctx.putImageData(imageData, 0, 0, rect.x, rect.y, rect.w, rect.h);
        }
      }
    }.bind(this);

    commitHandler();
    this.wl.on("update", () => commitHandler());

    this.wl.once("beforeWlDestroy", () => {
      // Unsure vvv
      this.dom.remove();
    });

    // this.initSeatMouse();
  }

  initSeatMouse(seat: Seat) {
    // TODO(multiparty): Single E.L. for each seat;

    const noForceLeave = (e: MouseEvent) => seat.move(e, this);
    this.dom.addEventListener("mouseenter", noForceLeave);
    this.onUnmount(function () { this.dom.removeEventListener("mouseenter", noForceLeave) });
    this.dom.addEventListener("mousemove", noForceLeave);
    this.onUnmount(function () { this.dom.removeEventListener("mousemove", noForceLeave) });

    const forceLeave = (e: MouseEvent) => seat.move(e, this, true);
    this.onUnmount(function () { this.dom.removeEventListener("mouseleave", forceLeave) });

    const mouseDown = (evt: MouseEvent) => {
      if (seat.mouseFocus)
        seat.mouseFocus.instances.buttonDown(Seat.mouseWebToButtonMap[evt.button]);
    };
    this.dom.addEventListener("mousedown", mouseDown);
    this.onUnmount(function () { this.dom.removeEventListener("mousedown", mouseDown) });

    const mouseUp = (evt: MouseEvent) => {
      if (seat.mouseFocus)
        seat.mouseFocus.instances.buttonUp(Seat.mouseWebToButtonMap[evt.button]);
    }
    this.dom.addEventListener("mouseup", mouseUp);
    this.onUnmount(function () { this.dom.removeEventListener("mouseup", mouseUp) });
  }
}
