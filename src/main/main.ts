import { app, BrowserWindow, ipcMain } from "electron";
import rawArgv from "@cathodique/simple-argv";
import { rmSync } from "node:fs";
import { registerProtocols } from "./protocols.js";
import { setupDmabufBridge, type DmabufBridgeServer } from "./dmabuf-bridge.js";

const argv = (rawArgv as any)?.default ?? rawArgv ?? {};
const deleteQueue: string[] = [];
let mainWindow: BrowserWindow | null = null;
let dmabufBridge: DmabufBridgeServer | null = null;

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      contextIsolation: false,
    },
  });

  mainWindow = win;
  win.webContents.openDevTools({ mode: "detach" });
  const qs = Object.keys(argv).length ? `?${new URLSearchParams(argv).toString()}` : "";
  win.loadURL(`app://top/index.html${qs}`);
};

app.whenReady().then(() => {
  registerProtocols();

  dmabufBridge = setupDmabufBridge(() => mainWindow);

  ipcMain.on("addToDeleteQueue", (_, arg1: string) => {
    if (typeof arg1 === "string" && !deleteQueue.includes(arg1)) {
      deleteQueue.push(arg1);
    }
  });

  createWindow();
});

function handleClose() {
  if (dmabufBridge) {
    try {
      dmabufBridge.close();
    } catch {}
  }

  const xdgDir = process.env.XDG_RUNTIME_DIR;

  for (const file of deleteQueue) {
    const isWaylandSocket =
      file.includes("wayland-") ||
      (xdgDir && file.startsWith(xdgDir)) ||
      file.match(/\/wayland-\d+(\.lock)?$/);

    if (isWaylandSocket) {
      try {
        rmSync(file, { force: true });
      } catch {}
      try {
        rmSync(`${file}.lock`, { force: true });
      } catch {}
    }
  }
}

app.on("window-all-closed", () => {
  handleClose();
  app.quit();
});

["exit", "SIGINT", "uncaughtException", "SIGTERM"].forEach((eventType) => {
  process.on(eventType, handleClose);
});
