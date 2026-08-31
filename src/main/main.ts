import { app, BrowserWindow, ipcMain } from "electron";
import rawArgv from "@cathodique/simple-argv";
import { rmSync } from "node:fs";
import { registerProtocols } from "./protocols.js";

const argv = (rawArgv as any)?.default ?? rawArgv ?? {};
const deleteQueue: string[] = [];

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      contextIsolation: false,
    },
  });

  win.webContents.openDevTools({ mode: "detach" });
  const qs = Object.keys(argv).length ? `?${new URLSearchParams(argv).toString()}` : "";
  win.loadURL(`app://top/index.html${qs}`);
};

app.whenReady().then(() => {
  registerProtocols();

  ipcMain.on("addToDeleteQueue", (_, arg1: string) => {
    if (typeof arg1 === "string" && !deleteQueue.includes(arg1)) {
      deleteQueue.push(arg1);
    }
  });

  createWindow();
});

function handleClose() {
  for (const file of deleteQueue) {
    if (!file.match(/^\/run\/user\/\d+\/wayland-\d+(.lock)?$/)) continue;
    try {
      rmSync(file, { force: true });
    } catch {}
  }
}

app.on("window-all-closed", () => {
  handleClose();
  app.quit();
});

["exit", "SIGINT", "uncaughtException", "SIGTERM"].forEach((eventType) => {
  process.on(eventType, handleClose);
});
