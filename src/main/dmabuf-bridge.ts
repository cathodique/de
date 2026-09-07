import { BrowserWindow, ipcMain, sharedTexture } from "electron";
import { UServer, USocket } from "@cathodique/usocket2";
import { closeSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DRM Format mappings to Electron pixelFormat
const DRM_FORMAT_ARGB8888 = 0x34325241;
const DRM_FORMAT_XRGB8888 = 0x34325258;
const DRM_FORMAT_ABGR8888 = 0x34324241;
const DRM_FORMAT_XBGR8888 = 0x34324258;
const DRM_FORMAT_RGBA8888 = 0x34324152;
const DRM_FORMAT_RGBX8888 = 0x34325852;
const DRM_FORMAT_BGRA8888 = 0x34324142;
const DRM_FORMAT_BGRX8888 = 0x34325842;
const DRM_FORMAT_NV12 = 0x3231564e;
const DRM_FORMAT_NV16 = 0x3631564e;

function drmFormatToElectronFormat(format: number): "bgra" | "rgba" | "nv12" {
  switch (format) {
    case DRM_FORMAT_ARGB8888:
    case DRM_FORMAT_XRGB8888:
    case DRM_FORMAT_BGRA8888:
    case DRM_FORMAT_BGRX8888:
      return "bgra";
    case DRM_FORMAT_ABGR8888:
    case DRM_FORMAT_XBGR8888:
    case DRM_FORMAT_RGBA8888:
    case DRM_FORMAT_RGBX8888:
      return "rgba";
    case DRM_FORMAT_NV12:
    case DRM_FORMAT_NV16:
      return "nv12";
    default:
      return "bgra";
  }
}

function getFormatPlaneInfo(format: number, planeIdx: number, height: number): { bpp: number; planeHeight: number } {
  if (format === DRM_FORMAT_NV12) {
    if (planeIdx === 0) return { bpp: 1, planeHeight: height };
    if (planeIdx === 1) return { bpp: 2, planeHeight: Math.ceil(height / 2) };
  } else if (format === DRM_FORMAT_NV16) {
    if (planeIdx === 0) return { bpp: 1, planeHeight: height };
    if (planeIdx === 1) return { bpp: 2, planeHeight: height };
  }
  // Standard 32-bit RGB formats (4 bytes per pixel)
  return { bpp: 4, planeHeight: height };
}

export interface DmabufBridgeServer {
  socketPath: string;
  close: () => void;
}

export function setupDmabufBridge(getMainWindow: () => BrowserWindow | null): DmabufBridgeServer {
  const socketPath = join(tmpdir(), `cathodique-dmabuf-${process.pid}.sock`);

  try {
    unlinkSync(socketPath);
  } catch {}

  const server = new UServer();

  server.on("connection", (sock: USocket) => {
    const pendingFds: number[] = [];
    let bufferAcc = Buffer.alloc(0);

    sock.on("fds", (fds: number[]) => {
      pendingFds.push(...fds);
    });

    sock.on("data", async (chunk: Buffer) => {
      bufferAcc = Buffer.concat([bufferAcc, chunk]);

      while (bufferAcc.length >= 4) {
        const msgLen = bufferAcc.readUInt32LE(0);
        if (bufferAcc.length < 4 + msgLen) break;

        const payloadBuffer = bufferAcc.subarray(4, 4 + msgLen);
        let msg: any;
        try {
          msg = JSON.parse(payloadBuffer.toString("utf8"));
        } catch (err) {
          console.error("[DmabufBridge Main] Failed to parse message JSON:", err);
          bufferAcc = bufferAcc.subarray(4 + msgLen);
          continue;
        }

        const requiredFds = msg.planes?.length ?? 1;
        if (pendingFds.length < requiredFds) {
          // Wait for FDs to arrive before consuming the message
          break;
        }

        bufferAcc = bufferAcc.subarray(4 + msgLen);
        const msgFds = pendingFds.splice(0, requiredFds);

        const win = getMainWindow();
        if (!win || win.isDestroyed() || !win.webContents?.mainFrame) {
          console.error("[DmabufBridge Main] Main window or frame not ready");
          for (const fd of msgFds) {
            try { closeSync(fd); } catch {}
          }
          continue;
        }

        try {
          const pixelFormat = drmFormatToElectronFormat(msg.format);
          const firstPlaneInfo = getFormatPlaneInfo(msg.format, 0, msg.height);
          const firstPlaneStride = msg.planes?.[0]?.stride ?? 0;
          const stridePixels = firstPlaneStride > 0 ? Math.floor(firstPlaneStride / firstPlaneInfo.bpp) : msg.width;
          const codedWidth = Math.max(msg.width, stridePixels);
          const codedHeight = msg.height;

          const planes = msg.planes.map((p: any, idx: number) => {
            const { planeHeight } = getFormatPlaneInfo(msg.format, idx, msg.height);
            const stride = p.stride;
            const offset = p.offset ?? 0;
            const computedSize = offset + stride * planeHeight;
            return {
              fd: msgFds[idx],
              stride,
              offset,
              size: p.size && p.size >= computedSize ? p.size : computedSize,
            };
          });

          const modifierStr = msg.planes[0]?.modifier ? String(msg.planes[0].modifier) : "0";

          const imported = sharedTexture.importSharedTexture({
            textureInfo: {
              pixelFormat,
              codedSize: { width: codedWidth, height: codedHeight },
              visibleRect: { x: 0, y: 0, width: msg.width, height: msg.height },
              handle: {
                nativePixmap: {
                  planes,
                  modifier: modifierStr,
                  supportsZeroCopyWebGpuImport: false,
                },
              },
            },
            allReferencesReleased: () => {
              for (const fd of msgFds) {
                try { closeSync(fd); } catch {}
              }
            },
          });

          await sharedTexture.sendSharedTexture(
            {
              frame: win.webContents.mainFrame,
              importedSharedTexture: imported,
            },
            msg.requestId
          );
        } catch (err) {
          console.error("[DmabufBridge Main] Failed to import/send shared texture:", err);
          for (const fd of msgFds) {
            try { closeSync(fd); } catch {}
          }
        }
      }
    });
  });

  server.listen(socketPath);

  ipcMain.handle("getDmabufBridgeSocketPath", () => {
    return socketPath;
  });

  return {
    socketPath,
    close: () => {
      try {
        server.close();
      } catch {}
      try {
        unlinkSync(socketPath);
      } catch {}
    },
  };
}
