"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInRegion = isInRegion;
const wayland_server_js_impl_1 = require("@cathodique/wayland-server-js-impl");
const wl_keyboard_1 = require("@cathodique/wayland-server-js-impl/dist/objects/wl_keyboard");
const wl_output_js_1 = require("@cathodique/wayland-server-js-impl/dist/objects/wl_output.js");
const wl_seat_js_1 = require("@cathodique/wayland-server-js-impl/dist/objects/wl_seat.js");
const wayland_interpreter_1 = require("@cathodique/wayland-server-js-impl/dist/wayland_interpreter");
const wl_region_1 = require("@cathodique/wayland-server-js-impl/dist/objects/wl_region");
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
const seatReg = new wl_seat_js_1.SeatRegistry([mySeat]);
const myOutput = { x: 0, y: 0, w: 1920, h: 1080, effectiveW: 1920, effectiveH: 1000 };
const outputReg = new wl_output_js_1.OutputRegistry([myOutput]);
const compo = new wayland_server_js_impl_1.Compositor({
    metadata: {
        wl_registry: {
            outputs: outputReg,
            seats: seatReg,
        },
        wl_keyboard: new wl_keyboard_1.KeyboardRegistry({ keymap: 'us' }),
    },
});
setInterval(() => compo.emit('tick'), 1000 / 60);
compo.on('connection', (c) => {
    console.log(c);
    const mySeatTransport = seatReg.transports.get(c).get(mySeat);
    const myOutputTransport = outputReg.transports.get(c).get(myOutput);
    c.on('wl_surface', async (surf) => {
        console.log(surf);
        const awaitCommit = () => new Promise((r) => surf.once('commit', (v) => r(v)));
        let firstRead = null;
        while (!surf.buffer.current) {
            console.log(surf);
            firstRead = await awaitCommit();
        }
        let width = surf.buffer.current.width;
        let height = surf.buffer.current.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        document.body.append(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error('Failed to derive 2d context from canvas element; is anything disabled?');
        console.log(surf);
        let wasInSurface = false;
        function move(evt, forceLeave) {
            (surf.xdgSurface?.parent).addCommand('ping', { serial: surf.connection.time.getTime() });
            if (!forceLeave || isInRegion(surf.inputRegions.current, evt.offsetY, evt.offsetX)) {
                if (!wasInSurface) {
                    wasInSurface = true;
                    console.log('enter');
                    mySeatTransport.emit('focus', surf);
                    mySeatTransport.emit('enter', surf, evt.offsetX, evt.offsetY);
                }
                console.log('move', evt.offsetX, evt.offsetY);
                mySeatTransport.emit('moveTo', evt.offsetX, evt.offsetY);
            }
            else {
                wasInSurface = false;
                console.log('leave');
                mySeatTransport.emit('blur', surf);
                mySeatTransport.emit('leave', surf);
            }
        }
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
            console.log('down', webToButtonMap[evt.button]);
            if (wasInSurface)
                mySeatTransport.emit('buttonDown', webToButtonMap[evt.button]);
        });
        canvas.addEventListener('mouseup', (evt) => {
            console.log('up', webToButtonMap[evt.button]);
            if (wasInSurface)
                mySeatTransport.emit('buttonUp', webToButtonMap[evt.button]);
        });
        function commitHandler(b) {
            console.log('hey', b);
            if (b == null)
                return;
            const arr = new Uint8ClampedArray(b.size);
            const stride = surf.buffer.current.stride;
            // Fill the array with the same RGBA values
            let curpix = 0;
            for (let y = 0; y < Math.ceil(b.size / stride); y += 1) {
                for (let x = 0; x < width; x += 1) {
                    // console.log(b.getByte(y + x + 0));
                    arr[curpix + 0] = b.getByte(y * stride + x * 4 + 0); // R value
                    arr[curpix + 1] = b.getByte(y * stride + x * 4 + 1); // G value
                    arr[curpix + 2] = b.getByte(y * stride + x * 4 + 2); // B value
                    if (surf.buffer.current.format === wayland_interpreter_1.interfaces['wl_shm'].enums.format.atoi.argb8888) {
                        arr[curpix + 3] = b.getByte(y * stride + x * 4 + 3); // A value
                    }
                    else {
                        arr[curpix + 3] = 255;
                    }
                    curpix += 4;
                }
            }
            b.addCommand('release', {});
            b.connection.sendPending();
            console.log(arr);
            if (arr.length > 0) {
                // Initialize a new ImageData object
                let imageData = new ImageData(arr, width);
                ctx.putImageData(imageData, 0, 0);
            }
        }
        commitHandler(firstRead);
        surf.on('commit', (p) => commitHandler(p));
        surf.once('commit', () => {
            myOutputTransport.emit('enter', surf);
        });
        surf.once('destroy', () => {
            surf.off('commit', commitHandler);
            canvas.remove();
        });
    });
});
compo.start();
