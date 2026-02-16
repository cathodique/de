import "../host/index.js";

import { HLCompositor } from "@cathodique/wl-serv-high";
import { InstructionType, RegRectangle } from "@cathodique/wl-serv-high/objects";
import { KeyboardRegistry } from "@cathodique/wl-serv-high/objects";
import { ipcRenderer } from "electron/renderer";
import { BaseObject } from "@cathodique/wl-serv-high/objects";
import { seatRegistry } from "./overlays/seatRegistryOverlay.js";
import { outputRegistry } from "./overlays/outputRegistryOverlay.js";
import { strutRegistry } from "./overlays/strutRegistryOverlay.js";
import { objectHandlers } from "../classes/handlers/handlers.js";
import { Reactive } from "@cathodique/wl-serv-high/lib";

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

const mySeatConfig = new Reactive({
  name: "seat0",
  capabilities: 3,
});
seatRegistry.addAuthority(mySeatConfig);
export const seat = seatRegistry.seatOfCfg(mySeatConfig)!;

const compo = new HLCompositor({
  wl_registry: {
    outputs: outputRegistry,
    seats: seatRegistry,
    struts: strutRegistry,
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
    new matching(obj).init();
  });
});
compo.start();

compo.on("ready", () => {
  document.body.append(`Ready at ${compo.params.socketPath}`);

  ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
  ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
