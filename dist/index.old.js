"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInRegion = isInRegion;
const wl_serv_high_1 = require("@cathodique/wl-serv-high");
const wl_output_1 = require("@cathodique/wl-serv-high/dist/objects/wl_output");
const wl_region_1 = require("@cathodique/wl-serv-high/dist/objects/wl_region");
const wl_seat_1 = require("@cathodique/wl-serv-high/dist/objects/wl_seat");
const wl_keyboard_1 = require("@cathodique/wl-serv-high/dist/objects/wl_keyboard");
const wl_surface_1 = require("@cathodique/wl-serv-high/dist/objects/wl_surface");
const electron_1 = require("electron");
const codeToScancode_1 = require("./codeToScancode");
function isInRegion(reg, y, x) {
    return reg.reduce((a, v) => {
        if (!v.hasCoordinate(y, x))
            return a;
        return v.type;
    }, null) === wl_region_1.InstructionType.Add;
}
const mySeat = {
    name: "seat0",
    capabilities: 3,
};
const seatReg = new wl_seat_1.SeatRegistry([mySeat]);
const myOutput = { x: 0, y: 0, w: 1920, h: 1080, effectiveW: 1920, effectiveH: 1080 };
const outputReg = new wl_output_1.OutputRegistry([myOutput]);
const compo = new wl_serv_high_1.HLCompositor({
    wl_registry: {
        outputs: outputReg,
        seats: seatReg,
    },
    wl_keyboard: new wl_keyboard_1.KeyboardRegistry({ keymap: 'us' }),
});
setInterval(() => compo.ticks.emit('tick'), 1000 / 60);
let currentSurface = null;
document.body.addEventListener('keydown', (v) => {
    if (!currentSurface)
        return;
    const isInMap = (code) => code in codeToScancode_1.codeToScan;
    if (!isInMap(v.code))
        return;
    const scancode = codeToScancode_1.codeToScan[v.code];
    currentSurface.emit('modifier', 0, 0, 0, 0);
    currentSurface.emit('keyDown', scancode);
});
document.body.addEventListener('keyup', (v) => {
    if (!currentSurface)
        return;
    const isInMap = (code) => code in codeToScancode_1.codeToScan;
    if (!isInMap(v.code))
        return;
    const scancode = codeToScancode_1.codeToScan[v.code];
    currentSurface.emit('modifier', 0, 0, 0, 0);
    currentSurface.emit('keyUp', scancode);
});
compo.on('connection', (c) => {
    // console.log(c);
    const mySeatTransport = seatReg.transports.get(c).get(mySeat);
    const myOutputTransport = outputReg.transports.get(c).get(myOutput);
    c.on('new_obj', async (surf) => {
        if (!(surf instanceof wl_surface_1.WlSurface))
            return;
        // console.log(surf);
        const awaitCommit = () => new Promise((r) => surf.once('wlCommit', (v) => r(v)));
        let firstRead = null;
        while (!surf.buffer.current) {
            // console.log(surf);
            firstRead = await awaitCommit();
        }
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error('Failed to derive 2d context from canvas element; is anything disabled?');
        // console.log(surf);
        let wasInSurface = false;
        let mouseMoved = 0;
        const move = function (evt, forceLeave) {
            (surf.xdgSurface?.parent).addCommand('ping', { serial: surf.connection.time.getTime() });
            if (mouseMoved % 100 === 9)
                console.log('mouse moved');
            mouseMoved += 1;
            if (!forceLeave || isInRegion(surf.inputRegions.current, evt.offsetY, evt.offsetX)) {
                if (!wasInSurface) {
                    wasInSurface = true;
                    currentSurface = surf;
                    // console.log('enter');
                    surf.emit('focus', surf, []);
                    surf.emit('enter', surf, evt.offsetX, evt.offsetY);
                }
                // console.log('move', evt.offsetX, evt.offsetY);
                surf.emit('moveTo', evt.offsetX, evt.offsetY);
            }
            else {
                wasInSurface = false;
                currentSurface = null;
                // console.log('leave');
                surf.emit('blur', surf);
                surf.emit('leave', surf);
            }
        };
        canvas.addEventListener('mouseenter', move);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseleave', (v) => move(v, true));
        const webToButtonMap = {
            0: 0x110,
            1: 0x112,
            2: 0x111,
            3: 0x116,
            4: 0x115,
        };
        canvas.addEventListener('mousedown', (evt) => {
            // console.log('down', webToButtonMap[evt.button]);
            if (wasInSurface)
                surf.emit('buttonDown', webToButtonMap[evt.button]);
        });
        canvas.addEventListener('mouseup', (evt) => {
            // console.log('up', webToButtonMap[evt.button]);
            if (wasInSurface)
                surf.emit('buttonUp', webToButtonMap[evt.button]);
        });
        const commitHandler = function () {
            const b = surf.buffer.current;
            console.log('aaa');
            if (b == null)
                return;
            canvas.width = b.width;
            canvas.height = b.height;
            const arr = new Uint8ClampedArray(b.getBuffer().buffer, 0, b.width * b.height * 4);
            // const stride = surf.buffer.current!.stride;
            // Fill the array with the same RGBA values
            // let curpix = 0;
            // let buf = b.getBuffer();
            // for (let y = 0; y < Math.ceil(b.size / stride); y += 1) {
            //   for (let x = 0; x < width; x += 1) {
            //     // console.log(b.getByte(y + x + 0));
            //     arr[curpix + 0] = buf.readUInt8(y * stride + x * 4 + 2); // R value
            //     arr[curpix + 1] = buf.readUInt8(y * stride + x * 4 + 1); // G value
            //     arr[curpix + 2] = buf.readUInt8(y * stride + x * 4 + 0); // B value
            //     if (surf.buffer.current!.format === interfaces['wl_shm'].enums.format.atoi.argb8888) {
            //       arr[curpix + 3] = buf.readUInt8(y * stride + x * 4 + 3); // A value
            //     } else {
            //       arr[curpix + 3] = 255;
            //     }
            //     curpix += 4;
            //   }
            // }
            b.addCommand('release', {});
            b.connection.sendPending();
            // surf.buffer.current?.addCommand('release', {});
            // b.connection.sendPending();
            // console.log(arr);
            if (arr.length > 0) {
                // Initialize a new ImageData object
                let imageData = new ImageData(arr, b.width);
                ctx.putImageData(imageData, 0, 0);
            }
        };
        commitHandler();
        surf.on('update', () => commitHandler());
        surf.once('wlCommit', () => {
            myOutputTransport.emit('enter', surf);
        });
        surf.once('wlDestroy', () => {
            surf.off('update', commitHandler);
            canvas.remove();
        });
    });
});
compo.start();
compo.on('ready', () => {
    document.body.append(`Ready at ${compo.params.socketPath}`);
    electron_1.ipcRenderer.send('addToDeleteQueue', compo.params.socketPath);
    electron_1.ipcRenderer.send(`Ready at ${compo.params.socketPath}.lock`);
});
