"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInRegion = isInRegion;
const wl_serv_high_1 = require("@cathodique/wl-serv-high");
const wl_region_1 = require("@cathodique/wl-serv-high/dist/objects/wl_region");
const wl_seat_1 = require("@cathodique/wl-serv-high/dist/objects/wl_seat");
const wl_keyboard_1 = require("@cathodique/wl-serv-high/dist/objects/wl_keyboard");
const wl_surface_1 = require("@cathodique/wl-serv-high/dist/objects/wl_surface");
const electron_1 = require("electron");
const codeToScancode_1 = require("./codeToScancode");
// import { WlPointer } from "@cathodique/wl-serv-high/dist/objects/wl_pointer";
// HERE
// TODO:::
// Direct events towards their respective authorities
// for both Seat and Output
function isInRegion(reg, y, x) {
    return (reg.reduce((a, v) => {
        if (!v.hasCoordinate(y, x))
            return a;
        return v.type;
    }, null) === wl_region_1.InstructionType.Add);
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
const compo = new wl_serv_high_1.HLCompositor({
    wl_registry: {
        outputs: [myOutput],
        seats: [mySeat],
    },
    wl_keyboard: new wl_keyboard_1.KeyboardRegistry({ keymap: "us" }),
});
setInterval(() => compo.ticks.emit("tick"), 1000 / 60);
let currentSurface = null;
// WTF!!
// let currentKeyboards: Map<HLConnection, WlKeyboard> = new Map();
document.body.addEventListener("keydown", (v) => {
    if (!currentSurface)
        return;
    const [surf, currentSeat] = currentSurface;
    const isInMap = (code) => code in codeToScancode_1.codeToScan;
    if (!isInMap(v.code))
        return;
    const scancode = codeToScancode_1.codeToScan[v.code];
    if (currentSeat)
        surf.emit("modifier", currentSeat, 0, 0, 0, 0);
    if (currentSeat)
        surf.emit("keyDown", currentSeat, scancode);
});
document.body.addEventListener("keyup", (v) => {
    if (!currentSurface)
        return;
    const [surf, currentSeat] = currentSurface;
    const isInMap = (code) => code in codeToScancode_1.codeToScan;
    if (!isInMap(v.code))
        return;
    const scancode = codeToScancode_1.codeToScan[v.code];
    if (currentSeat)
        surf.emit("modifier", currentSeat, 0, 0, 0, 0);
    if (currentSeat)
        surf.emit("keyUp", currentSeat, scancode);
});
compo.on("connection", (c) => {
    // console.log(c);
    // let currentKeyboard: WlKeyboard | undefined;
    // let currentPointer: WlPointer | undefined;
    let currentSeat;
    // const myOutputTransport = outputReg.transports.get(c)!.get(myOutput)!;
    c.on("new_obj", async (surf) => {
        if (surf instanceof wl_seat_1.WlSeat) {
            currentSeat = surf.authority.config;
            if (currentSurface)
                currentSurface = [currentSurface[0], currentSeat];
            return;
        }
        if (!(surf instanceof wl_surface_1.WlSurface))
            return;
        // console.log(surf);
        // const awaitCommit = () => new Promise<WlBuffer>((r) => surf.once('wlCommit', () => r()));
        const canvas = document.createElement("canvas");
        canvas.classList.add("window");
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Failed to derive 2d context from canvas element; is anything disabled?");
        // console.log(surf);
        let wasInSurface = false;
        surf.on("updateRole", () => {
            if (surf.role === "cursor") {
                canvas.style.display = "none";
            }
        });
        let mouseMoved = 0;
        const move = function (evt, forceLeave) {
            // console.log(surf);
            surf.xdgSurface?.parent?.addCommand("ping", {
                serial: surf.connection.time.getTime(),
            });
            if (mouseMoved % 100 === 9)
                console.log("mouse moved");
            mouseMoved += 1;
            if (!forceLeave ||
                (surf.inputRegions.current.length &&
                    isInRegion(surf.inputRegions.current, evt.offsetY, evt.offsetX))) {
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
            }
            else {
                wasInSurface = false;
                currentSurface = null;
                // console.log('leave');
                if (currentSeat) {
                    surf.emit("blur", currentSeat);
                    surf.emit("leave", currentSeat);
                }
            }
        };
        canvas.addEventListener("mouseenter", move);
        canvas.addEventListener("mousemove", move);
        canvas.addEventListener("mouseleave", (v) => move(v, true));
        const webToButtonMap = {
            0: 0x110,
            1: 0x112,
            2: 0x111,
            3: 0x116,
            4: 0x115,
        };
        canvas.addEventListener("mousedown", (evt) => {
            // console.log('down', webToButtonMap[evt.button]);
            if (wasInSurface && currentSeat)
                surf.emit("buttonDown", currentSeat, webToButtonMap[evt.button]);
        });
        canvas.addEventListener("mouseup", (evt) => {
            // console.log('up', webToButtonMap[evt.button]);
            if (wasInSurface && currentSeat)
                surf.emit("buttonUp", currentSeat, webToButtonMap[evt.button]);
        });
        let lastDimensions = [-Infinity, -Infinity];
        const commitHandler = async function () {
            const b = surf.buffer.current;
            if (b == null)
                return;
            if (lastDimensions[0] !== b.height || lastDimensions[1] !== b.width) {
                canvas.width = b.width;
                canvas.height = b.height;
                lastDimensions = [b.height, b.width];
            }
            const currlyDamagedBuffer = surf.getCurrlyDammagedBuffer();
            for (const rect of currlyDamagedBuffer) {
                b.updateBufferArea(rect.y, rect.x, rect.h, rect.w);
            }
            const arr = new Uint8ClampedArray(b.buffer.buffer, 0, b.width * b.height * 4);
            if (arr.length > 0) {
                let imageData = new ImageData(arr, b.width, b.height);
                // const bitmap = await createImageBitmap(imageData, 0, 0, b.width, b.height);
                // b.addCommand('release', {});
                // b.connection.sendPending();
                // surf.buffer.current?.addCommand('release', {});
                // b.connection.sendPending();
                for (const rect of currlyDamagedBuffer) {
                    ctx.putImageData(imageData, 0, 0, rect.x, rect.y, rect.w, rect.h);
                }
            }
            if (!document.body.contains(canvas))
                document.body.append(canvas);
        };
        commitHandler();
        surf.on("update", () => commitHandler());
        surf.once("wlCommit", () => {
            surf.emit("shown", myOutput);
        });
        surf.once("wlDestroy", () => {
            surf.off("update", commitHandler);
            canvas.remove();
        });
    });
});
compo.start();
compo.on("ready", () => {
    document.body.append(`Ready at ${compo.params.socketPath}`);
    electron_1.ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
    electron_1.ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
