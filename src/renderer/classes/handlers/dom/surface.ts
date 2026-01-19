import { WlSurface } from "@cathodique/wl-serv-high/objects";
import { Seat } from "../../wayland/seat/seat.js";
import { BaseDom } from "./base.js";
import { Output } from "../../wayland/output/output.js";
import { wlToObj } from "../handlers.js";
import { seat } from "../../../wayland/index.js";
import { outputRegistry } from "../../../wayland/overlays/outputRegistryOverlay.js";
import { isIntersecting } from "../../../utils/domIntersect.js";

export class SurfaceDom extends BaseDom<WlSurface, HTMLDivElement> {
  static domToSurface = new Map<HTMLDivElement, SurfaceDom>();

  ctx: CanvasRenderingContext2D;
  canvas = document.createElement("canvas");
  constructor(wl: WlSurface) {
    super(wl, document.createElement("div"));
    this.dom.append(this.canvas);

    SurfaceDom.domToSurface.set(this.dom, this);
    wlToObj.set(wl, this);

    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.dom.style.position = "relative";

    const ctx = this.canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Failed to derive 2d context from canvas element; is anything disabled?",
      );
    this.ctx = ctx;
  }

  shownOnOutputs = new Set<Output>();

  init() {
    this.initDraw();
    this.initSeatMouse(seat);
    this.initOutputs();
  }
  initDraw() {
    let lastDimensions: [number, number] = [-Infinity, -Infinity];
    const commitHandler = async function (this: SurfaceDom) {
      const b = this.wl.buffer.current;

      this.canvas.style.display = b === null ? "none" : "block";
      if (b == null) return;

      if (lastDimensions[0] !== b.meta.height || lastDimensions[1] !== b.meta.width) {
        this.dom.style.width = `${b.meta.width}px`;
        this.dom.style.height = `${b.meta.height}px`;
        this.canvas.width = b.meta.width;
        this.canvas.height = b.meta.height;
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
        console.log("Got Update?", currlyDamagedBuffer);

        let imageData = new ImageData(arr, b.meta.width, b.meta.height);

        for (const rect of currlyDamagedBuffer) {
          const w = Math.min(rect.w, b.meta.width - rect.x);
          const h = Math.min(rect.h, b.meta.height - rect.y);
          this.ctx.putImageData(imageData, 0, 0, rect.x, rect.y, w, h);
        }
      }
    }.bind(this);

    commitHandler();
    this.wl.on("update", () => commitHandler());

    this.wl.once("beforeWlDestroy", () => {
      // Unsure vvv
      this.dom.remove();
    });
  }

  initSeatMouse(seat: Seat) {
    // LT-TODO(multiparty): Single E.L. for each seat;

    const enter = (e: MouseEvent) => {
      seat.setKeyboardFocus(this);
      seat.move(e, this);
    };
    this.dom.addEventListener("mouseenter", enter);
    this.onUnmount(() => { this.dom.removeEventListener("mouseenter", enter) });

    const move = (e: MouseEvent) => seat.move(e, this);
    this.dom.addEventListener("mousemove", move);
    this.onUnmount(() => { this.dom.removeEventListener("mousemove", move) });

    const leave = (e: MouseEvent) => {
      seat.move(e, this, true);
      seat.unsetKeyboardFocus();
    };
    this.onUnmount(() => { this.dom.removeEventListener("mouseleave", leave) });

    const mouseDown = (evt: MouseEvent) => {
      if (seat.mouseFocus)
        seat.mouseFocus.instances.buttonDown(Seat.mouseWebToButtonMap[evt.button]);
    };
    this.dom.addEventListener("mousedown", mouseDown);
    this.onUnmount(() => { this.dom.removeEventListener("mousedown", mouseDown) });

    const mouseUp = (evt: MouseEvent) => {
      if (seat.mouseFocus)
        seat.mouseFocus.instances.buttonUp(Seat.mouseWebToButtonMap[evt.button]);
    }
    this.dom.addEventListener("mouseup", mouseUp);
    this.onUnmount(() => { this.dom.removeEventListener("mouseup", mouseUp) });
  }

  unmounted: boolean = false;
  updateAllOutputs() {
    if (this.unmounted) return;

    if (this.wl.buffer.current == null) {
      for (const shownOn of this.wl.outputs) {
        this.wl.leaveOutput(shownOn.config);
      }
    } else {
      for (const output of outputRegistry.allOutputs()) {
        const intersect = isIntersecting(this.dom, output.dom);

        if (this.wl.outputs.has(output.wlOutputAuth.get(this.wl.connection)!) !== intersect) {
          console.log(intersect);

          if (intersect) this.wl.enterOutput(output.config);
          else this.wl.leaveOutput(output.config);
        }
      }
    }

    requestAnimationFrame(this.updateAllOutputs.bind(this));
  }
  initOutputs() {
    requestAnimationFrame(this.updateAllOutputs.bind(this));
    this.onUnmount(() => { this.unmounted = false });
  }
  enterOutput(output: Output) {
    this.wl.enterOutput(output.config);
  }
  leaveOutput(output: Output) {
    this.wl.leaveOutput(output.config);
  }
}
