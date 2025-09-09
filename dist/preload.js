"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    deleteAfterDone: (file) => electron_1.ipcRenderer.send('addToDeleteQueue', file),
});
