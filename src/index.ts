import { HLCompositor, HLConnection } from "@cathodique/wl-serv-high";
import {
  InstructionType,
  RegRectangle,
} from "@cathodique/wl-serv-high/dist/objects/wl_region";
import { SeatAuthority, SeatConfiguration, WlSeat } from "@cathodique/wl-serv-high/dist/objects/wl_seat";
import { KeyboardRegistry } from "@cathodique/wl-serv-high/dist/objects/wl_keyboard";
import { BaseObject } from "@cathodique/wl-serv-high/dist/objects/base_object";
import { WlSurface } from "@cathodique/wl-serv-high/dist/objects/wl_surface";
import { XdgWmBase } from "@cathodique/wl-serv-high/dist/objects/xdg_wm_base";
import { ipcRenderer } from "electron";

import { codeToScan } from "./codeToScancode";
import { WlSubsurface } from "@cathodique/wl-serv-high/dist/objects/wl_subsurface";
import { XdgToplevel } from "@cathodique/wl-serv-high/dist/objects/xdg_toplevel";
import { WindowGeometry, XdgSurface } from "@cathodique/wl-serv-high/dist/objects/xdg_surface";
import { ZxdgToplevelDecorationV1 } from "@cathodique/wl-serv-high/dist/objects/zxdg_decoration_manager_v1";
import { WlBuffer } from "@cathodique/wl-serv-high/dist/objects/wl_buffer";
// import { WlPointer } from "@cathodique/wl-serv-high/dist/objects/wl_pointer";

// HERE
// TODO:::
// Direct events towards their respective authorities
// for both Seat and Output

export function isInRegion(reg: RegRectangle[], y: number, x: number, defaultValue: boolean = false) {
  if (reg.length === 0) return defaultValue;

  return (
    reg.reduce<InstructionType | null>((a, v) => {
      if (v.hasCoordinate(y, x)) return v.type;
      return a;
    }, null) === InstructionType.Add
  );
}

const knownMods = ["Shift", "Lock", "Control", "Mod1", "Mod2", "Mod3", "Mod4", "Mod5"] as const;
class Modifiers {
  depressed = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  depressedBitmask = 0;
  latched = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  latchedBitmask = 0;
  locked = Object.fromEntries(knownMods.map((v) => [v, false])) as Record<typeof knownMods[number], boolean>;
  lockedBitmask = 0;

  group = 0;

  seatConfig: SeatConfiguration;

  constructor(seatConfig: SeatConfiguration) {
    this.seatConfig = seatConfig;
  }

  updateAccordingly(evt: KeyboardEvent | MouseEvent) {
    let changed = { depressed: false, latched: false, locked: false };
    function checkIfChangedAndUpdate(origin: Record<typeof knownMods[number], boolean>, modifier: typeof knownMods[number], value: boolean) {
      if (origin[modifier] === value) return false;
      origin[modifier] = value;
      return true;
    }
    // Shift: "Shift"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Shift", evt.getModifierState("Shift"));
    // Lock: "CapsLock"
    changed.locked ||= checkIfChangedAndUpdate(this.locked, "Lock", evt.getModifierState("CapsLock"));
    if (evt instanceof KeyboardEvent) changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Lock", evt.type === "keydown" && evt.key === "CapsLock");
    // Control: "Control"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Control", evt.getModifierState("Control"));
    // Mod1: "Alt"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod1", evt.getModifierState("Alt"));
    // Mod2: "NumLock"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod2", evt.getModifierState("NumLock"));
    // Mod3: "Hyper" (No Level 5 in browser spec)
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod3", evt.getModifierState("Hyper"));
    // Mod4: "Meta"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod4", evt.getModifierState("Meta"));
    // Mod5: "AltGraph"
    changed.depressed ||= checkIfChangedAndUpdate(this.depressed, "Mod5", evt.getModifierState("AltGraph"));

    return changed;
  }

  static createMask(object: Record<typeof knownMods[number], boolean>) {
    let result = 0;
    for (let modIdx = 0; modIdx < knownMods.length; modIdx += 1) {
      const mask = 2 ** modIdx;
      if (object[knownMods[modIdx]]) result += mask;
    }

    return result;
  }

  update(connection: HLConnection, serial?: number) {
    const authority = connection.display.seatAuthorities.get(this.seatConfig)!;

    authority.modifiers(this.depressedBitmask, this.latchedBitmask, this.lockedBitmask, this.group, serial);
  }

  ifUpdateThenEmit(evt: KeyboardEvent | MouseEvent, connection: HLConnection) {
    const xWasUpdated = this.updateAccordingly(evt);
    if (xWasUpdated.depressed || xWasUpdated.latched || xWasUpdated.locked) {
      if (xWasUpdated.depressed)  this.depressedBitmask = Modifiers.createMask(this.depressed);
      if (xWasUpdated.latched)    this.latchedBitmask   = Modifiers.createMask(this.latched);
      if (xWasUpdated.locked)     this.lockedBitmask    = Modifiers.createMask(this.locked);

      this.update(connection);
    }
  }
}

const mySeat = {
  name: "seat0",
  capabilities: 3,
  modifiers: null as unknown as Modifiers,
};
mySeat.modifiers = new Modifiers(mySeat);
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

const tickAnimationFrame = () => {
  compo.ticks.emit("tick");
  requestAnimationFrame(tickAnimationFrame);
};
tickAnimationFrame();

const surfaceToDom = new Map<WlSurface, HTMLDivElement>();

let currentSeat: SeatAuthority | undefined = undefined;
// WTF!!
// let currentKeyboards: Map<HLConnection, WlKeyboard> = new Map();

document.body.addEventListener("keydown", (v) => {
  if (!currentSeat) {
    mySeat.modifiers.updateAccordingly(v);
    return;
  }
  v.preventDefault();
  mySeat.modifiers.ifUpdateThenEmit(v, currentSeat.connection);

  const isInMap = (code: string): code is keyof typeof codeToScan =>
    code in codeToScan;
  if (!isInMap(v.code)) return;

  const scancode = codeToScan[v.code];

  // if (currentSeat) surf.modifiers(currentSeat, 0, 0, 0, 0);
  currentSeat.keyDown(scancode);
});

document.body.addEventListener("keyup", (v) => {
  if (!currentSeat) {
    mySeat.modifiers.updateAccordingly(v);
    return;
  }
  v.preventDefault();
  mySeat.modifiers.ifUpdateThenEmit(v, currentSeat.connection);

  const isInMap = (code: string): code is keyof typeof codeToScan =>
    code in codeToScan;
  if (!isInMap(v.code)) return;

  const scancode = codeToScan[v.code];

  // if (currentSeat) surf.modifiers(currentSeat, 0, 0, 0, 0);
  currentSeat.keyUp(scancode);
});

const buffers = new Map<WlBuffer, HTMLCanvasElement>();

compo.on("connection", (c) => {
  // console.log(c);

  // let currentKeyboard: WlKeyboard | undefined;
  // let currentPointer: WlPointer | undefined;
  // const myOutputTransport = outputReg.transports.get(c)!.get(myOutput)!;

  c.on("new_obj", async (obj: BaseObject) => {
    // TODO: Separate buffer logic up here!
    if (obj instanceof ZxdgToplevelDecorationV1) {
      obj.on('wlSetMode', () => {
        obj.sendToplevelDecoration('server_side');
      });
      obj.sendToplevelDecoration('server_side');
    }
    if (obj instanceof WlSeat) {
      currentSeat = obj.authority;
      return;
    }
    if (obj instanceof WlSubsurface) {
      const parentDom = surfaceToDom.get(obj.meta.parent)!;

      parentDom.prepend(surfaceToDom.get(obj.meta.surface)!);

      // Subsurface shenanigans
      // TODO: Apply on commit
      obj.on("wlPlaceAbove", function (this: WlSubsurface, { sibling: other }: { sibling: WlSurface }) {
        switch (this.getRelationWith(other)) {
          case "sibling": {
            const siblingDom = surfaceToDom.get(other)!;
            const parentDom = siblingDom.parentElement!;

            parentDom.insertBefore(surfaceToDom.get(this.meta.surface)!, siblingDom);
            break;
          }
          case "parent": {
            const parentDom = surfaceToDom.get(other)!;
            const parentCanvas = Array.from(parentDom.children).find((v) => v.tagName === 'canvas')!;

            parentDom.insertBefore(surfaceToDom.get(this.meta.surface)!, parentCanvas);
            break;
          }
          default:
          // Already handled by wl-serv-high
        }
      });

      obj.on("wlPlaceBelow", function (this: WlSubsurface, { sibling: other }: { sibling: WlSurface }) {
        switch (this.getRelationWith(other)) {
          case "sibling": {
            const siblingDom = surfaceToDom.get(other)!;
            const parentDom = siblingDom.parentElement!;

            parentDom.insertBefore(surfaceToDom.get(this.meta.surface)!, siblingDom.nextSibling);
            break;
          }
          case "parent": {
            const parentDom = surfaceToDom.get(other)!;
            const parentCanvas = Array.from(parentDom.children).find((v) => v.tagName === 'canvas')!;

            parentDom.insertBefore(surfaceToDom.get(this.meta.surface)!, parentCanvas.nextSibling);
            break;
          }
          default:
          // Already handled by wl-serv-high
        }
      });
      obj.on('wlSetPosition', function (this: WlSubsurface, { y, x }: { y: number, x: number }) {
        const thisDom = surfaceToDom.get(this.meta.surface)!;

        thisDom.style.top = `${y}px`;
        thisDom.style.left = `${x}px`;
      });
    }

    if (!(obj instanceof WlSurface)) return;

    // console.log(surf);
    // const awaitCommit = () => new Promise<WlBuffer>((r) => surf.once('wlCommit', () => r()));
    const container = document.createElement("div") as HTMLDivElement;
    container.classList.add("surface-container");

    container.style.display = "none";

    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    canvas.classList.add("surface-contents");

    // FPS element
    // const fpsEl = document.createElement('p');
    // let lastFrameTimes = [1];
    // let lastNow = Date.now();

    container.append(canvas);

    surfaceToDom.set(obj, container);

    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Failed to derive 2d context from canvas element; is anything disabled?",
      );

    // console.log(surf);

    let wasInSurface = false;

    obj.on("updateRole", () => {
      switch (obj.role) {
        case "cursor":
          break;
        case "toplevel":
          const titleTextNode = document.createTextNode('Window');

          const toplevel = obj.xdgSurface!.toplevel!;

          const windowTemplate = document.querySelector('template#window')! as HTMLTemplateElement;
          const clone = windowTemplate.content.cloneNode(true) as DocumentFragment;

          const cropContainer = document.createElement('div');
          cropContainer.classList.add('crop-container');
          cropContainer.append(container);

          const windowGeometryDoubleBuff = (toplevel.parent as XdgSurface).geometry;
          function applyWindowGeometry(windowGeometry: WindowGeometry) {
            cropContainer.style.height = `${windowGeometry.height}px`;
            cropContainer.style.width = `${windowGeometry.width}px`;
            container.style.top = `-${windowGeometry.y}px`;
            container.style.left = `-${windowGeometry.x}px`;
          }
          applyWindowGeometry(windowGeometryDoubleBuff.current);
          windowGeometryDoubleBuff.on('current', applyWindowGeometry);

          clone.querySelector('slot[name=window_title]')!.replaceWith(titleTextNode);
          clone.querySelector('slot[name=window_contents]')!.replaceWith(cropContainer);

          titleTextNode.textContent = toplevel.title || 'Untitled window';
          toplevel.on('wlSetTitle', (v) => titleTextNode.textContent = toplevel.title || 'Untitled window');

          document.body.append(clone);
          container.classList.add("xdg-toplevel");
          break;
        case "popup":
          document.body.append(container);
          container.classList.add("xdg-popup");
          break;
        case "subsurface":
          container.classList.add("subsurface");
          break;
      }
    });

    const move = function (evt: MouseEvent, forceLeave?: boolean) {
      (obj.xdgSurface?.parent as XdgWmBase)?.addCommand("ping", {
        serial: obj.connection.time.getTime(),
      });

      const containerPos = container.getBoundingClientRect();

      const mouseY = evt.clientY - containerPos.top;
      const mouseX = evt.clientX - containerPos.left;

      console.log("Something ok?");

      console.log(obj, obj.inputRegions, obj.inputRegions.current, mouseY, mouseX);

      evt.stopPropagation();

      if (
        !forceLeave &&
        isInRegion(obj.inputRegions.current, mouseY, mouseX, true)
      ) {
        if (!wasInSurface) {
          wasInSurface = true;
          currentSeat = obj.connection.display.seatAuthorities.get(mySeat)!;
          console.log('enter');
          const enterSerial = currentSeat.focus(obj, []);
          mySeat.modifiers.update(currentSeat.connection, enterSerial);
          currentSeat.enter(obj, mouseX, mouseY);
        }
        currentSeat!.moveTo(mouseX, mouseY);
      } else {
        if (wasInSurface) {
          wasInSurface = false;
          if (currentSeat) currentSeat.blur(obj);
          if (currentSeat) currentSeat.leave(obj);
          currentSeat = undefined;
          console.log('leave');
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
      if (wasInSurface && currentSeat)
        currentSeat.buttonDown(webToButtonMap[evt.button]);
    });
    container.addEventListener("mouseup", (evt) => {
      if (wasInSurface && currentSeat)
        currentSeat.buttonUp(webToButtonMap[evt.button]);
    });

    let wasShown = false;

    let lastDimensions: [number, number] = [-Infinity, -Infinity];
    const commitHandler = async function () {

      const b = obj.buffer.current;

      if (b === null) container.style.display = "none";
      if (b == null) return;

      if (!wasShown) {
        wasShown = true;
        obj.shown(myOutput);
      }

      container.style.display = "block";
      if (lastDimensions[0] !== b.meta.height || lastDimensions[1] !== b.meta.width) {
        container.style.width = `${b.meta.width}px`;
        container.style.height = `${b.meta.height}px`;
        canvas.width = b.meta.width;
        canvas.height = b.meta.height;
        lastDimensions = [b.meta.height, b.meta.width];
      }

      container.style.transform = ``;

      const currlyDamagedBuffer = obj.getCurrlyDammagedBuffer();

      for (const rect of currlyDamagedBuffer) {
        b.updateBufferArea(rect.y, rect.x, rect.h, rect.w)
      }
      const arr = new Uint8ClampedArray(
        b.buffer.buffer,
        0,
        b.meta.width * b.meta.height * 4,
      );
      if (arr.length > 0) {
        let imageData = new ImageData(arr, b.meta.width, b.meta.height);

        for (const rect of currlyDamagedBuffer) {
          ctx!.putImageData(imageData, 0, 0, rect.x, rect.y, rect.w, rect.h);
        }
      }
    };

    commitHandler();
    obj.on("update", () => commitHandler());

    obj.once("beforeWlDestroy", () => {
      // Unsure vvv
      container.remove();
    });
  });
});
compo.start();

compo.on("ready", () => {
  document.body.append(`Ready at ${compo.params.socketPath}`);
  ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
  ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
