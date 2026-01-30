import { app, BrowserWindow, ipcMain } from "electron";
import { rmSync } from "node:fs";

import { registerProtocols } from "./protocols.js";

const createWindow = () => {
  const win = new BrowserWindow({
    // fullscreen: true,
    // resizable: false,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      contextIsolation: false,
    },
  });

  registerProtocols();

  win.webContents.openDevTools({ mode: "detach" });
  win.loadURL("app://top/index.html");
};

const deleteQueue: string[] = [];

app.whenReady().then(() => {
  ipcMain.on("addToDeleteQueue", (_, arg1: string) => deleteQueue.push(arg1));
  createWindow();
});

function handleClose() {
  for (const file of deleteQueue) {
    if (!file.match(/^\/run\/user\/\d+\/wayland-\d+(.lock)?$/g)) continue;

    try {
      rmSync(file);
    } catch (e) {
      const err = e as any;

      if (err.code === "ENOENT") return; // Whatevs
      throw e;
    }
  }
}

app.on("window-all-closed", () => {
  handleClose();

  app.quit();
});

[`exit`, `SIGINT`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
  process.on(eventType, handleClose);
});
