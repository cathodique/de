"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// app.allowRendererProcessReuse = false;
// app.commandLine.appendSwitch("disable-hid-blocklist");
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        // fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    // win.webContents.openDevTools();
    win.loadFile((0, node_path_1.join)(__dirname, "../dist/index.html"));
};
const deleteQueue = [];
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.on("addToDeleteQueue", (_, arg1) => deleteQueue.push(arg1));
    createWindow();
});
function handleClose() {
    for (const file of deleteQueue) {
        if (!file.match(/^\/run\/user\/\d+\/wayland-\d+(.lock)?$/g))
            continue;
        try {
            (0, node_fs_1.rmSync)(file);
        }
        catch (e) {
            const err = e;
            if (err.code === "ENOENT")
                return; // Whatevs
            throw e;
        }
    }
}
electron_1.app.on("window-all-closed", () => {
    handleClose();
    electron_1.app.quit();
});
[`exit`, `SIGINT`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, handleClose);
});
