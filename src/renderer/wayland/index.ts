import "../host/index.js";

import { HLCompositor } from "@cathodique/wl-serv-high";
import { InstructionType, RegRectangle } from "@cathodique/wl-serv-high/dist/objects/wl_region.js";
import { Modifiers } from "../classes/wayland/seat/modifiers.js";
import { SeatRegistry } from "@cathodique/wl-serv-high/dist/registries/seat.js";
import { OutputRegistry } from "@cathodique/wl-serv-high/dist/registries/output.js";
import { KeyboardRegistry } from "@cathodique/wl-serv-high/dist/objects/wl_keyboard.js";
import { ipcRenderer } from "electron/renderer";
import { Seat } from "../classes/wayland/seat/seat.js";
import { BaseObject } from "@cathodique/wl-serv-high/dist/objects/base_object.js";
import { objectHandlers } from "../classes/handlers/handlers.js";
import { Output } from "../classes/wayland/output/output.js";

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

const mySeatConfig = {
  name: "seat0",
  capabilities: 3,
  modifiers: null as unknown as Modifiers,
};
const seatReg = new SeatRegistry();

new Seat(mySeatConfig, seatReg);

seatReg.addAuthority(mySeatConfig);

const myOutputConfig = {
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
  effectiveW: 1920,
  effectiveH: 1080,
};
const outputReg = new OutputRegistry();
outputReg.addAuthority(myOutputConfig);

new Output(myOutputConfig, outputReg);

new Seat(mySeatConfig, seatReg);

const compo = new HLCompositor({
  wl_registry: {
    outputs: outputReg,
    seats: seatReg,
  },
  wl_keyboard: new KeyboardRegistry({ keymap: "us" }),
});

const tickAnimationFrame = () => {
  compo.ticks.emit("tick");
  requestAnimationFrame(tickAnimationFrame);
};
tickAnimationFrame();

compo.on("connection", (c) => {
  c.on("new_obj", async (obj: BaseObject) => {
    const matching = objectHandlers[obj.iface as keyof typeof objectHandlers];

    if (!matching) return;

    // @ts-ignore
    new matching(obj);
  });
});
compo.start();

compo.on("ready", () => {
  document.body.append(`Ready at ${compo.params.socketPath}`);
  ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
  ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
