import { HLCompositor } from "@cathodique/wl-serv-high";
import {
  InstructionType,
  RegRectangle,
} from "@cathodique/wl-serv-high/dist/objects/wl_region";
import { SeatConfiguration, WlSeat } from "@cathodique/wl-serv-high/dist/objects/wl_seat";
import { KeyboardRegistry } from "@cathodique/wl-serv-high/dist/objects/wl_keyboard";
import { BaseObject } from "@cathodique/wl-serv-high/dist/objects/base_object";
import { WlSurface } from "@cathodique/wl-serv-high/dist/objects/wl_surface";
import {
  WlOutput,
  OutputConfiguration,
} from "@cathodique/wl-serv-high/dist/objects/wl_output";

import { XdgWmBase } from "@cathodique/wl-serv-high/dist/objects/xdg_wm_base";
import { ipcRenderer } from "electron";

import { codeToScan } from "./codeToScancode";
import { WlBuffer } from "@cathodique/wl-serv-high/dist/objects/wl_buffer";
// import { WlPointer } from "@cathodique/wl-serv-high/dist/objects/wl_pointer";

// HERE
// TODO:::
// Direct events towards their respective authorities
// for both Seat and Output

export function isInRegion(reg: RegRectangle[], y: number, x: number) {
  return (
    reg.reduce<InstructionType | null>((a, v) => {
      if (!v.hasCoordinate(y, x)) return a;
      return v.type;
    }, null) === InstructionType.Add
  );
}

const mySeat = {
  name: "seat0",
  capabilities: 3,
};
// const seatReg = new SeatRegistry([mySeat]);

const myOutput = {
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
  effectiveW: 1920,
  effectiveH: 1080,
};
// const outputReg = new OutputRegistry([myOutput]);

// const outputMap = new Map<OutputConfiguration, WlOutput>();

const compo = new HLCompositor({
  wl_registry: {
    outputs: [myOutput],
    seats: [mySeat],
  },
  wl_keyboard: new KeyboardRegistry({ keymap: "us" }),
});

setInterval(() => compo.ticks.emit("tick"), 1000 / 60);

const surfaceToDom = new Map<WlSurface, HTMLDivElement>();

let currentSurface: [WlSurface, SeatConfiguration?] | null = null;
// WTF!!
// let currentKeyboards: Map<HLConnection, WlKeyboard> = new Map();

document.body.addEventListener("keydown", (v) => {
  if (!currentSurface) return;
  const [surf, currentSeat] = currentSurface;

  const isInMap = (code: string): code is keyof typeof codeToScan =>
    code in codeToScan;
  if (!isInMap(v.code)) return;

  const scancode = codeToScan[v.code];

  if (currentSeat) surf.emit("modifier", currentSeat, 0, 0, 0, 0);
  if (currentSeat) surf.emit("keyDown", currentSeat, scancode);
});

document.body.addEventListener("keyup", (v) => {
  if (!currentSurface) return;
  const [surf, currentSeat] = currentSurface;

  const isInMap = (code: string): code is keyof typeof codeToScan =>
    code in codeToScan;
  if (!isInMap(v.code)) return;

  const scancode = codeToScan[v.code];

  if (currentSeat) surf.emit("modifier", currentSeat, 0, 0, 0, 0);
  if (currentSeat) surf.emit("keyUp", currentSeat, scancode);
});

compo.on("connection", (c) => {
  // console.log(c);

  // let currentKeyboard: WlKeyboard | undefined;
  // let currentPointer: WlPointer | undefined;
  let currentSeat: SeatConfiguration | undefined;

  // const myOutputTransport = outputReg.transports.get(c)!.get(myOutput)!;

  c.on("new_obj", async (surf: BaseObject) => {
    if (surf instanceof WlSeat) {
      currentSeat = surf.authority.config;
      if (currentSurface) currentSurface = [currentSurface[0], currentSeat];
      return;
    }

    if (!(surf instanceof WlSurface)) return;

    // console.log(surf);
    // const awaitCommit = () => new Promise<WlBuffer>((r) => surf.once('wlCommit', () => r()));
    const container = document.createElement("div") as HTMLDivElement;
    container.classList.add("window");

    container.style.display = "none";

    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    canvas.classList.add("contents");

    surfaceToDom.set(surf, container);

    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Failed to derive 2d context from canvas element; is anything disabled?",
      );

    // console.log(surf);

    let wasInSurface = false;

    surf.on("updateRole", () => {
      switch (surf.role) {
        case "cursor":
          break;
        case "toplevel":
          document.body.append(container);
          break
        case "popup":
          document.body.append(container);
          break;
      }
    });

    let mouseMoved = 0;
    const move = function (evt: MouseEvent, forceLeave?: boolean) {
      // console.log(surf);
      (surf.xdgSurface?.parent as XdgWmBase)?.addCommand("ping", {
        serial: surf.connection.time.getTime(),
      });

      if (mouseMoved % 100 === 9) console.log("mouse moved");
      mouseMoved += 1;

      if (
        !forceLeave ||
        (surf.inputRegions.current.length &&
          isInRegion(surf.inputRegions.current, evt.offsetY, evt.offsetX))
      ) {
        if (!wasInSurface) {
          wasInSurface = true;
          currentSurface = [surf, currentSeat];
          // console.log('enter');
          if (currentSeat) {
            surf.emit("focus", currentSeat, []);
            surf.emit("enter", currentSeat, evt.offsetX, evt.offsetY);
          }
        }
        // console.log('move', evt.offsetX, evt.offsetY);
        if (currentSeat) {
          surf.emit("moveTo", currentSeat, evt.offsetX, evt.offsetY);
        }
      } else {
        wasInSurface = false;
        currentSurface = null;
        // console.log('leave');
        if (currentSeat) {
          surf.emit("blur", currentSeat);
          surf.emit("leave", currentSeat);
        }
      }
    };

    container.addEventListener("mouseenter", move);
    container.addEventListener("mousemove", move);
    container.addEventListener("mouseleave", (v) => move(v, true));
    const webToButtonMap: Record<string, number> = {
      0: 0x110,
      1: 0x112,
      2: 0x111,
      3: 0x116,
      4: 0x115,
    };
    container.addEventListener("mousedown", (evt) => {
      // console.log('down', webToButtonMap[evt.button]);
      if (wasInSurface && currentSeat)
        surf.emit("buttonDown", currentSeat, webToButtonMap[evt.button]);
    });
    container.addEventListener("mouseup", (evt) => {
      // console.log('up', webToButtonMap[evt.button]);
      if (wasInSurface && currentSeat)
        surf.emit("buttonUp", currentSeat, webToButtonMap[evt.button]);
    });

    let lastDimensions: [number, number] = [-Infinity, -Infinity];
    const commitHandler = async function () {
      const b = surf.buffer.current;

      if (b == null) {
        container.style.display = "none";
        return;
      }
      container.style.display = "block";
      if (lastDimensions[0] !== b.height || lastDimensions[1] !== b.width) {
        container.style.width = `${b.width}px`;
        container.style.height = `${b.height}px`;
        canvas.width = b.width;
        canvas.height = b.height;
        lastDimensions = [b.height, b.width];
      }

      const currlyDamagedBuffer = surf.getCurrlyDammagedBuffer();

      for (const rect of currlyDamagedBuffer) {
        b.updateBufferArea(rect.y, rect.x, rect.h, rect.w)
      }
      const arr = new Uint8ClampedArray(
        b.buffer.buffer,
        0,
        b.width * b.height * 4,
      );
      if (arr.length > 0) {
        let imageData = new ImageData(arr, b.width, b.height);

        // const bitmap = await createImageBitmap(imageData, 0, 0, b.width, b.height);
        // b.addCommand('release', {});
        // b.connection.sendPending();
        // surf.buffer.current?.addCommand('release', {});
        // b.connection.sendPending();

        for (const rect of currlyDamagedBuffer) {
          ctx!.putImageData(imageData, 0, 0, rect.x, rect.y, rect.w, rect.h);
        }
      }
    };

    commitHandler();
    surf.on("update", () => commitHandler());

    surf.once("wlCommit", () => {
      surf.emit("shown", myOutput);
    });

    surf.once("wlDestroy", () => {
      surf.off("update", commitHandler);
      // Unsure vvv
      container.remove();
    });


    // Subsurface shenanigans
    // surf.on("wlPlaceAbove", () => {
    //   if ()
    // });
  });
});
compo.start();

compo.on("ready", () => {
  document.body.append(`Ready at ${compo.params.socketPath}`);
  ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
  ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
