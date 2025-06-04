import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

// app.allowRendererProcessReuse = false;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(join(__dirname, '../assets/index.html'));
}

app.whenReady().then(() => {
  createWindow()
});
