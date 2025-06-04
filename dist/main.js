"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = require("node:path");
// app.allowRendererProcessReuse = false;
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    win.loadFile((0, node_path_1.join)(__dirname, '../assets/index.html'));
};
electron_1.app.whenReady().then(() => {
    createWindow();
});
