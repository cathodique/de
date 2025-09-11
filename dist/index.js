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
const wl_subsurface_1 = require("@cathodique/wl-serv-high/dist/objects/wl_subsurface");
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
const surfaceToDom = new Map();
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
        surf.emit("modifiers", currentSeat, 0, 0, 0, 0);
    if (currentSeat)
        surf.emit("keyUp", currentSeat, scancode);
});
compo.on("connection", (c) => {
    // console.log(c);
    // let currentKeyboard: WlKeyboard | undefined;
    // let currentPointer: WlPointer | undefined;
    let currentSeat;
    // const myOutputTransport = outputReg.transports.get(c)!.get(myOutput)!;
    c.on("new_obj", async (obj) => {
        if (obj instanceof wl_seat_1.WlSeat) {
            currentSeat = obj.authority.config;
            if (currentSurface)
                currentSurface = [currentSurface[0], currentSeat];
            return;
        }
        if (obj instanceof wl_subsurface_1.WlSubsurface) {
            const parentDom = surfaceToDom.get(obj.assocParent);
            parentDom.append(surfaceToDom.get(obj.assocSurface));
            // Subsurface shenanigans
            // TODO: Apply on commit
            obj.on("wlPlaceAbove", function ({ sibling: other }) {
                switch (this.getRelationWith(other)) {
                    case "sibling": {
                        const siblingDom = surfaceToDom.get(other);
                        const parentDom = siblingDom.parentElement;
                        parentDom.insertBefore(surfaceToDom.get(this.assocSurface), siblingDom.nextSibling);
                        break;
                    }
                    case "parent": {
                        const parentDom = surfaceToDom.get(other);
                        parentDom.insertBefore(surfaceToDom.get(this.assocSurface), parentDom.querySelector('canvas').nextSibling);
                        break;
                    }
                    default:
                    // Already handled by wl-serv-high
                }
            });
            obj.on("wlPlaceBelow", function ({ sibling: other }) {
                switch (this.getRelationWith(other)) {
                    case "sibling": {
                        const siblingDom = surfaceToDom.get(other);
                        const parentDom = siblingDom.parentElement;
                        parentDom.insertBefore(surfaceToDom.get(this.assocSurface), siblingDom);
                        break;
                    }
                    case "parent": {
                        const parentDom = surfaceToDom.get(other);
                        parentDom.insertBefore(surfaceToDom.get(this.assocSurface), parentDom.querySelector('canvas'));
                        break;
                    }
                    default:
                    // Already handled by wl-serv-high
                }
            });
            obj.on('wlSetPosition', function ({ y, x }) {
                const thisDom = surfaceToDom.get(this.assocSurface);
                thisDom.style.top = `${y}px`;
                thisDom.style.left = `${x}px`;
            });
        }
        if (!(obj instanceof wl_surface_1.WlSurface))
            return;
        // console.log(surf);
        // const awaitCommit = () => new Promise<WlBuffer>((r) => surf.once('wlCommit', () => r()));
        const container = document.createElement("div");
        container.classList.add("surface-container");
        container.style.display = "none";
        const canvas = document.createElement("canvas");
        canvas.classList.add("surface-contents");
        // FPS element
        // const fpsEl = document.createElement('p');
        let lastNow = 0;
        container.append(canvas);
        surfaceToDom.set(obj, container);
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Failed to derive 2d context from canvas element; is anything disabled?");
        // console.log(surf);
        let wasInSurface = false;
        obj.on("updateRole", () => {
            switch (obj.role) {
                case "cursor":
                    break;
                case "toplevel":
                    document.body.append(container);
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
        // let mouseMoved = 0;
        const move = function (evt, forceLeave) {
            if (!currentSeat)
                return;
            evt.target.style.outline = '#f00 solid 2px';
            // console.log(surf);
            obj.xdgSurface?.parent?.addCommand("ping", {
                serial: obj.connection.time.getTime(),
            });
            const containerPos = container.getBoundingClientRect();
            const mouseY = evt.clientY - containerPos.top;
            const mouseX = evt.clientX - containerPos.left;
            if (evt.target !== container && evt.target !== canvas)
                return; // I give up on this shit wtf.
            // if (mouseMoved % 100 === 9) console.log("mouse moved");
            // mouseMoved += 1;
            if (!forceLeave ||
                (obj.inputRegions.current.length &&
                    isInRegion(obj.inputRegions.current, evt.offsetY, mouseX))) {
                if (!wasInSurface) {
                    wasInSurface = true;
                    currentSurface = [obj, currentSeat];
                    // console.log('enter');
                    obj.emit("focus", currentSeat, []);
                    obj.emit("enter", currentSeat, mouseX, mouseY);
                }
                // console.log('move', evt.offsetX, evt.offsetY);
                obj.emit("moveTo", currentSeat, mouseX, mouseY);
            }
            else {
                evt.target.style.outline = 'unset';
                wasInSurface = false;
                currentSurface = null;
                // console.log('leave');
                obj.emit("blur", currentSeat);
                obj.emit("leave", currentSeat);
            }
        };
        container.addEventListener("mouseover", move);
        container.addEventListener("mousemove", move);
        container.addEventListener("mouseout", (v) => move(v, true));
        const webToButtonMap = {
            0: 0x110,
            1: 0x112,
            2: 0x111,
            3: 0x116,
            4: 0x115,
        };
        container.addEventListener("mousedown", (evt) => {
            // console.log('down', webToButtonMap[evt.button]);
            if (wasInSurface && currentSeat)
                obj.emit("buttonDown", currentSeat, webToButtonMap[evt.button]);
        });
        container.addEventListener("mouseup", (evt) => {
            // console.log('up', webToButtonMap[evt.button]);
            if (wasInSurface && currentSeat)
                obj.emit("buttonUp", currentSeat, webToButtonMap[evt.button]);
        });
        let wasShown = false;
        let lastDimensions = [-Infinity, -Infinity];
        const commitHandler = async function () {
            // console.log(obj);
            const b = obj.buffer.current;
            const now = Date.now();
            const fps = 1 / ((now - lastNow) / 1000);
            console.log(`${fps}Hz`);
            lastNow = now;
            if (b === null)
                container.style.display = "none";
            if (b == null)
                return;
            // TODO: Make shown state within each wlsurface
            if (!wasShown) {
                wasShown = true;
                obj.emit("shown", myOutput);
            }
            container.style.display = "block";
            if (lastDimensions[0] !== b.height || lastDimensions[1] !== b.width) {
                container.style.width = `${b.width}px`;
                container.style.height = `${b.height}px`;
                canvas.width = b.width;
                canvas.height = b.height;
                lastDimensions = [b.height, b.width];
            }
            canvas.style.transform = `translate(${obj.offset.current[1]}px, ${obj.offset.current[0]}px)`;
            const currlyDamagedBuffer = obj.getCurrlyDammagedBuffer();
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
    electron_1.ipcRenderer.send("addToDeleteQueue", compo.params.socketPath);
    electron_1.ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
