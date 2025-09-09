import { app, BrowserWindow, ipcMain } from "electron";
import { rmSync } from "node:fs";
import { join } from "node:path";

// app.allowRendererProcessReuse = false;

// app.commandLine.appendSwitch("disable-hid-blocklist");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    // fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // win.webContents.openDevTools();
  win.loadFile(join(__dirname, "../dist/index.html"));
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
