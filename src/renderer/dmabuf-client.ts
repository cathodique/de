import { USocket } from "@cathodique/usocket2";
import type { WlBufferExtended, DmabufBufferMetadata } from "./modules/cathodique/window/index.js";

export interface ImportedTextureResult {
  importedSharedTexture: unknown;
  videoFrame: VideoFrame;
}

export interface PendingTextureImport {
  resolve: (res: ImportedTextureResult) => void;
  reject: (err: Error) => void;
}

export interface ElectronSharedTextureApi {
  setSharedTextureReceiver: (
    receiver: (data: unknown, identifier?: string) => Promise<void>
  ) => void;
}

export class DmabufBridgeClient {
  private socket: USocket | null = null;
  private isConnected: boolean = false;
  private sharedTexture: ElectronSharedTextureApi;
  private nextRequestId: number = 1;
  private pendingImports: Map<string, PendingTextureImport> = new Map();
  private encoder: TextEncoder = new TextEncoder();

  constructor(sharedTexture: ElectronSharedTextureApi) {
    this.sharedTexture = sharedTexture;
    this.initReceiver();
  }

  private initReceiver(): void {
    if (!this.sharedTexture || typeof this.sharedTexture.setSharedTextureReceiver !== "function") {
      throw new Error("[DmabufClient] sharedTexture.setSharedTextureReceiver is not available");
    }

    this.sharedTexture.setSharedTextureReceiver(
      async (data: unknown, identifier?: string): Promise<void> => {
        const payloadObj = data as { identifier?: string; requestId?: string; importedSharedTexture?: unknown; frame?: VideoFrame; getVideoFrame?: () => VideoFrame } | undefined;
        const reqId = identifier ?? payloadObj?.identifier ?? payloadObj?.requestId;

        let pending = reqId ? this.pendingImports.get(reqId) : undefined;
        const firstEntry = this.pendingImports.entries().next().value;
        if (!pending && this.pendingImports.size === 1 && firstEntry) {
          const [firstKey, firstPending] = firstEntry;
          this.pendingImports.delete(firstKey);
          pending = firstPending;
        } else if (reqId && pending) {
          this.pendingImports.delete(reqId);
        }

        if (pending) {
          const importedTexture = payloadObj?.importedSharedTexture ?? data;
          const videoFrame =
            (importedTexture as { getVideoFrame?: () => VideoFrame })?.getVideoFrame?.() ??
            payloadObj?.frame;
          if (videoFrame) {
            pending.resolve({
              importedSharedTexture: importedTexture,
              videoFrame,
            });
          } else {
            pending.reject(new Error("[DmabufClient] No valid VideoFrame in texture receiver callback"));
          }
        }
      }
    );
  }

  public async connect(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new USocket(socketPath, () => {
        this.isConnected = true;
        resolve();
      });
      this.socket.on("error", (err: Error) => {
        if (!this.isConnected) reject(err);
      });
    });
  }

  public async importBuffer(dmabufBuffer: WlBufferExtended): Promise<VideoFrame | null> {
    if (dmabufBuffer.videoFrame) {
      return dmabufBuffer.videoFrame;
    }
    const existingPromise = (dmabufBuffer as { _importPromise?: Promise<ImportedTextureResult> })._importPromise;
    if (existingPromise) {
      const res = await existingPromise;
      return res.videoFrame;
    }

    const dmMeta = ((dmabufBuffer.meta && "planes" in dmabufBuffer.meta)
      ? dmabufBuffer.meta
      : dmabufBuffer.dmabufMeta) as DmabufBufferMetadata | undefined;

    if (!this.socket || !dmMeta?.planes?.length) {
      return null;
    }

    const requestId = `dmabuf_${this.nextRequestId++}`;
    const planes = dmMeta.planes;
    const fds = planes.map((p) => p.fd);

    const payload = JSON.stringify({
      requestId,
      width: dmMeta.width,
      height: dmMeta.height,
      format: dmMeta.format,
      planes: planes.map((p) => ({
        planeIdx: p.planeIdx,
        offset: p.offset,
        stride: p.stride,
        modifier: p.modifier ? p.modifier.toString() : "0",
      })),
    });

    const payloadBytes = this.encoder.encode(payload);
    const fullMsg = new Uint8Array(4 + payloadBytes.length);
    const view = new DataView(fullMsg.buffer, fullMsg.byteOffset, fullMsg.byteLength);
    view.setUint32(0, payloadBytes.length, true);
    fullMsg.set(payloadBytes, 4);

    // USocket requires a Node.js Buffer instance (Buffer.isBuffer(data) === true)
    const dataBuffer = Buffer.isBuffer(fullMsg)
      ? fullMsg
      : Buffer.from(fullMsg.buffer, fullMsg.byteOffset, fullMsg.byteLength);

    const promise = new Promise<ImportedTextureResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingImports.delete(requestId);
        reject(new Error(`Timeout importing dmabuf texture (${requestId})`));
      }, 5000);

      this.pendingImports.set(requestId, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.socket?.write(
        {
          data: dataBuffer,
          fds,
        },
        (err?: Error | null) => {
          if (err) {
            this.pendingImports.delete(requestId);
            clearTimeout(timeout);
            reject(err);
          }
        }
      );
    });

    (dmabufBuffer as { _importPromise?: Promise<ImportedTextureResult> })._importPromise = promise;

    try {
      const result = await promise;
      (dmabufBuffer as { importedSharedTexture?: unknown }).importedSharedTexture = result.importedSharedTexture;
      dmabufBuffer.videoFrame = result.videoFrame;
      if (dmabufBuffer.surface) {
        dmabufBuffer.surface.emit("update");
      }
      return result.videoFrame;
    } finally {
      delete (dmabufBuffer as { _importPromise?: Promise<ImportedTextureResult> })._importPromise;
    }
  }

  public close(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.isConnected = false;
    }
    for (const [, pending] of this.pendingImports) {
      pending.reject(new Error("DmabufBridgeClient closed"));
    }
    this.pendingImports.clear();
  }
}
