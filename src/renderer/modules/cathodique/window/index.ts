/**
 * Cathodique Window Implementation Module (@cathodique/window).
 * Encapsulates Wayland xdg_toplevel surfaces, subsurfaces, popups, buffer rendering in ShadowRoot,
 * geometry clipping, and I/O event handling into an Informa-statified Window object.
 */

import $ from "informa";
import mmap from "@cathodique/mmap-io";
import { AbstractWindow, type WindowGeometry, type CathodiqueWindow as ICathodiqueWindow } from "@cathodique/window-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";
import type { XdgToplevel, XdgPopup, WlSurface, WlBuffer } from "@cathodique/wl-serv-high/objects";
import type { SeatRegistry, SeatAuthority, SeatInstances, OutputConfiguration } from "@cathodique/wl-serv-high/registries";
import type { HLConnection } from "@cathodique/wl-serv-high";

// Linux input event button codes (from linux/input-event-codes.h)
const BTN_LEFT = 272; // 0x110
const BTN_RIGHT = 273; // 0x111
const BTN_MIDDLE = 274; // 0x112
const BTN_SIDE = 275;
const BTN_EXTRA = 276;

// Standard DOM KeyboardEvent.code to Linux evdev scancodes
const DOM_CODE_TO_EVDEV: Record<string, number> = {
  // Letters
  KeyA: 30, KeyB: 48, KeyC: 46, KeyD: 32, KeyE: 18, KeyF: 33, KeyG: 34, KeyH: 35,
  KeyI: 23, KeyJ: 36, KeyK: 37, KeyL: 38, KeyM: 50, KeyN: 49, KeyO: 24, KeyP: 25,
  KeyQ: 16, KeyR: 19, KeyS: 31, KeyT: 20, KeyU: 22, KeyV: 47, KeyW: 17, KeyX: 45,
  KeyY: 21, KeyZ: 44,
  // Digits
  Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6,
  Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
  // Function keys
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  // Controls & Punctuation
  Escape: 1, Backspace: 14, Tab: 15, Enter: 28, Space: 57,
  Minus: 12, Equal: 13, BracketLeft: 26, BracketRight: 27,
  Backslash: 43, Semicolon: 39, Quote: 40, Backquote: 41,
  Comma: 51, Period: 52, Slash: 53,
  // Modifiers
  ShiftLeft: 42, ShiftRight: 54,
  ControlLeft: 29, ControlRight: 97,
  AltLeft: 56, AltRight: 100,
  MetaLeft: 125, MetaRight: 126,
  CapsLock: 58,
  // Navigation
  Insert: 110, Delete: 111, Home: 102, End: 107,
  PageUp: 104, PageDown: 109,
  ArrowUp: 103, ArrowDown: 108, ArrowLeft: 105, ArrowRight: 106,
  // Numpad
  Numpad0: 82, Numpad1: 79, Numpad2: 80, Numpad3: 81, Numpad4: 75,
  Numpad5: 76, Numpad6: 77, Numpad7: 71, Numpad8: 72, Numpad9: 73,
  NumpadEnter: 96, NumpadAdd: 78, NumpadSubtract: 74,
  NumpadMultiply: 55, NumpadDivide: 98, NumpadDecimal: 83,
};

function domCodeToLinuxKey(code: string, keyCode: number): number {
  if (DOM_CODE_TO_EVDEV[code] !== undefined) {
    return DOM_CODE_TO_EVDEV[code];
  }
  return keyCode;
}

function getModifiersMask(e: KeyboardEvent): number {
  let mask = 0;
  if (e.shiftKey) mask |= 1;
  if (e.ctrlKey) mask |= 4;
  if (e.altKey) mask |= 8;
  if (e.metaKey) mask |= 64;
  return mask;
}

export interface DmabufBufferMetadata {
  width: number;
  height: number;
  format?: number;
  stride?: number;
  planes?: Array<{
    fd: number;
    planeIdx: number;
    offset: number;
    stride: number;
    modifier?: bigint | number | string;
  }>;
}

export type WlBufferExtended = WlBuffer & {
  videoFrame?: VideoFrame;
  importedSharedTexture?: { getVideoFrame: () => VideoFrame; release?: () => void };
  dmabufMeta?: DmabufBufferMetadata;
  _importPromise?: Promise<{ importedSharedTexture: unknown; videoFrame: VideoFrame }>;
  updateBufferArea?: (y: number, x: number, height: number, width: number) => Uint8Array | { buffer: ArrayBuffer; byteOffset: number; byteLength: number } | null;
  data?: Uint8Array;
  pendingRelease?: () => void;
  release?: () => void;
};

function domButtonToLinuxButton(button: number): number {
  switch (button) {
    case 0:
      return BTN_LEFT;
    case 1:
      return BTN_MIDDLE;
    case 2:
      return BTN_RIGHT;
    case 3:
      return BTN_SIDE;
    case 4:
      return BTN_EXTRA;
    default:
      return BTN_LEFT;
  }
}

interface WebGLRendererState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  vao: WebGLVertexArrayObject;
  texBuf: WebGLBuffer;
  forceOpaqueLoc: WebGLUniformLocation;
}

const renderers = new WeakMap<HTMLCanvasElement, WebGLRendererState>();

function getOrCreateWebGLRenderer(canvas: HTMLCanvasElement): WebGLRendererState {
  let state = renderers.get(canvas);
  if (state) return state;

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    desynchronized: false,
    antialias: false,
    preserveDrawingBuffer: true,
  })!;

  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(
    vs,
    `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }`
  );
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(
    fs,
    `#version 300 es
    precision mediump float;
    uniform sampler2D u_image;
    uniform int u_forceOpaque;
    in vec2 v_texCoord;
    out vec4 outColor;
    void main() {
      vec4 color = texture(u_image, v_texCoord);
      if (u_forceOpaque == 1) {
        outColor = vec4(color.rgb, 1.0);
      } else {
        outColor = color;
      }
    }`
  );
  gl.compileShader(fs);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  const posLoc = gl.getAttribLocation(program, "a_position");
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  const forceOpaqueLoc = gl.getUniformLocation(program, "u_forceOpaque")!;

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const texBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  state = { gl, program, texture, vao, texBuf, forceOpaqueLoc };
  renderers.set(canvas, state);
  return state;
}

function releasePreviousBuffer(
  previousBuffer?: WlBufferExtended | null,
  currentBuffer?: WlBufferExtended | null
): void {
  if (previousBuffer && previousBuffer !== currentBuffer) {
    previousBuffer.release?.();
  }
}

function isBufferOpaque(format?: number): boolean {
  if (format === undefined) return true;
  // DRM_FORMAT_XRGB8888, DRM_FORMAT_XBGR8888, DRM_FORMAT_RGBX8888, DRM_FORMAT_BGRX8888, SHM format 1 (XRGB)
  return (
    format === 0x34325258 ||
    format === 0x34324258 ||
    format === 0x34325852 ||
    format === 0x34325842 ||
    format === 1
  );
}

function paintBufferToCanvas(
  buffer: WlBufferExtended | null | undefined,
  canvas: HTMLCanvasElement,
  previousBuffer?: WlBufferExtended | null
): boolean {
  if (!buffer || !canvas) return false;

  const { gl, program, texture, vao, forceOpaqueLoc } = getOrCreateWebGLRenderer(canvas);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);

  const format = buffer.dmabufMeta?.format ?? buffer.meta?.format;
  const opaque = isBufferOpaque(format);

  // 1. DMA-BUF VideoFrame path
  if (buffer.importedSharedTexture) {
    const vf = typeof (buffer.importedSharedTexture as any).getVideoFrame === "function"
      ? (buffer.importedSharedTexture as any).getVideoFrame()
      : buffer.videoFrame;

    if (vf) {
      const width = buffer.dmabufMeta?.width ?? vf.displayWidth;
      const height = buffer.dmabufMeta?.height ?? vf.displayHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform1i(forceOpaqueLoc, opaque ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vf);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (typeof vf.close === "function" && vf !== buffer.videoFrame) {
        vf.close();
      }

      gl.flush();
      releasePreviousBuffer(previousBuffer, buffer);
      return true;
    }
  }

  if (buffer.videoFrame) {
    const vf = buffer.videoFrame;
    const width = buffer.dmabufMeta?.width ?? vf.displayWidth;
    const height = buffer.dmabufMeta?.height ?? vf.displayHeight;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform1i(forceOpaqueLoc, opaque ? 1 : 0);
    gl.bindVertexArray(vao);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vf);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.flush();
    releasePreviousBuffer(previousBuffer, buffer);
    return true;
  }

  // 2. SHM / Memory Buffer path
  const meta = buffer.meta;
  const width = meta?.width ?? (canvas.width > 0 ? canvas.width : 640);
  const height = meta?.height ?? (canvas.height > 0 ? canvas.height : 480);
  const stride = meta?.stride ?? width * 4;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const isXRGB = opaque;
  const poolId = (buffer.parent as { bufferId?: number } | undefined)?.bufferId;
  if (poolId !== undefined) {
    const pool = mmap.getbuffer(poolId);
    if (pool && pool.length > 0) {
      const offset = meta?.offset ?? 0;
      const rgba = new Uint8Array(width * height * 4);

      for (let y = 0; y < height; y++) {
        const srcRow = offset + y * stride;
        const dstRow = y * width * 4;
        for (let x = 0; x < width; x++) {
          const si = srcRow + x * 4;
          const di = dstRow + x * 4;
          if (si + 3 >= pool.length) break;

          rgba[di] = pool[si + 2];     // R
          rgba[di + 1] = pool[si + 1]; // G
          rgba[di + 2] = pool[si];     // B
          rgba[di + 3] = isXRGB ? 255 : (pool[si + 3] === 0 ? 255 : pool[si + 3]); // A
        }
      }

      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform1i(forceOpaqueLoc, isXRGB ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.flush();
      releasePreviousBuffer(previousBuffer, buffer);
      return true;
    }
  }

  return false;
}

export class CathodiqueWindow extends AbstractWindow implements ICathodiqueWindow {
  static readonly [IS_COMPONENT] = true;

  public readonly id: string;
  public readonly toplevel: XdgToplevel;
  private readonly seats?: SeatRegistry;
  private destroyListeners = new Set<() => void>();

  // Shadow DOM and Rendering Elements
  private containerElement: HTMLElement;
  private shadow: ShadowRoot;
  private mainCanvas: HTMLCanvasElement;
  private subsurfaceCanvases = new Map<number, HTMLCanvasElement>();
  private popupCanvases = new Map<number, HTMLCanvasElement>();
  private canvasToSurface = new WeakMap<HTMLCanvasElement, WlSurface>();
  private trackedSurfaces = new Set<number>();
  private currentPointerSurface: WlSurface | null = null;

  constructor(
    toplevel: XdgToplevel,
    seats?: SeatRegistry,
    initialGeometry?: Partial<WindowGeometry>
  ) {
    super();

    this.toplevel = toplevel;
    this.seats = seats;
    this.id = `wl-win-${toplevel.oid}`;
    this.title = toplevel.title ?? "Wayland Application";
    this.appId = toplevel.appId ?? "wayland-app";
    this.geometry = {
      x: 120,
      y: 80,
      width: 640,
      height: 480,
      ...(initialGeometry ?? {}),
    };

    // Initialize shadow container
    this.containerElement = document.createElement("div");
    this.containerElement.className = "cathodique-window-host";
    this.containerElement.tabIndex = -1;
    this.containerElement.style.display = "block";
    this.containerElement.style.width = "100%";
    this.containerElement.style.height = "100%";
    this.containerElement.style.position = "relative";
    this.containerElement.style.overflow = "hidden";
    this.containerElement.style.outline = "none";

    this.shadow = this.containerElement.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        outline: none;
      }
      canvas.main-surface {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        pointer-events: auto;
        z-index: 1;
      }
      canvas.subsurface {
        position: absolute;
        display: block;
        pointer-events: auto;
      }
      canvas.popup-surface {
        position: absolute;
        display: block;
        pointer-events: auto;
        z-index: 1000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      }
    `;
    this.shadow.appendChild(style);

    this.mainCanvas = document.createElement("canvas");
    this.mainCanvas.className = "main-surface";
    this.mainCanvas.width = this.geometry.width || 640;
    this.mainCanvas.height = this.geometry.height || 480;
    this.shadow.appendChild(this.mainCanvas);
    this.canvasToSurface.set(this.mainCanvas, this.getSurface());

    this.setupWaylandEvents();
    this.setupDOMInputEvents();
  }

  private getSeatInstances(): SeatInstances | undefined {
    const surface = this.getSurface();
    const conn = surface.connection as HLConnection | undefined;
    if (!conn) return undefined;

    const seatReg = ((conn.display?.seatRegistry as SeatRegistry | undefined) ?? this.seats);
    if (!seatReg) return undefined;

    const authority: SeatAuthority | undefined = seatReg.values().next().value;
    return authority?.get(conn);
  }

  private trackSubsurfaceTree(parentSurface: WlSurface, parentAbsX = 0, parentAbsY = 0, baseZ = 2): void {
    const order = (parentSurface as any).subsurfaceOrder ?? Array.from(parentSurface.daughterSurfaces || []);

    order.forEach((daughter: WlSurface, index: number) => {
      const zIndex = baseZ + index;
      const offX = daughter.offset ? daughter.offset[0] : 0;
      const offY = daughter.offset ? daughter.offset[1] : 0;
      const absX = parentAbsX + offX;
      const absY = parentAbsY + offY;

      let daughterCanvas = this.subsurfaceCanvases.get(daughter.oid);
      if (!daughterCanvas) {
        daughterCanvas = document.createElement("canvas");
        daughterCanvas.className = `subsurface subsurface-${daughter.oid}`;
        this.shadow.appendChild(daughterCanvas);
        this.subsurfaceCanvases.set(daughter.oid, daughterCanvas);
        this.canvasToSurface.set(daughterCanvas, daughter);
      }

      daughterCanvas.style.zIndex = String(zIndex);
      daughterCanvas.style.left = `${absX}px`;
      daughterCanvas.style.top = `${absY}px`;

      const daughterBuffer = daughter.buffer as WlBufferExtended | null | undefined;
      if (daughterBuffer) {
        daughterCanvas.style.display = "block";
        const daughterWidth = daughterBuffer.dmabufMeta?.width ?? daughterBuffer.meta?.width ?? daughterBuffer.videoFrame?.displayWidth ?? 640;
        const daughterHeight = daughterBuffer.dmabufMeta?.height ?? daughterBuffer.meta?.height ?? daughterBuffer.videoFrame?.displayHeight ?? 480;

        daughterCanvas.width = daughterWidth;
        daughterCanvas.height = daughterHeight;
        daughterCanvas.style.width = `${daughterWidth}px`;
        daughterCanvas.style.height = `${daughterHeight}px`;

        if (!daughterBuffer.videoFrame && !daughterBuffer.importedSharedTexture && daughterBuffer._importPromise) {
          daughterBuffer._importPromise.then(() => {
            if (daughterCanvas) {
              const painted = paintBufferToCanvas(daughterBuffer, daughterCanvas, (daughter as any).previousBuffer);
              if (painted) {
                (daughter as any).previousBuffer = undefined;
              }
            }
          });
        } else {
          const painted = paintBufferToCanvas(daughterBuffer, daughterCanvas, (daughter as any).previousBuffer);
          if (painted) {
            (daughter as any).previousBuffer = undefined;
          }
        }
      } else {
        daughterCanvas.style.display = "none";
        if ((daughter as any).previousBuffer) {
          (daughter as any).previousBuffer.release?.();
          (daughter as any).previousBuffer = undefined;
        }
      }

      if (!this.trackedSurfaces.has(daughter.oid)) {
        this.trackedSurfaces.add(daughter.oid);

        const renderThisSubsurface = () => {
          this.trackSubsurfaceTree(parentSurface, parentAbsX, parentAbsY, baseZ);
        };

        daughter.on("update", renderThisSubsurface);
        daughter.on("new_subsurface", renderThisSubsurface);
        daughter.on("restack_subsurfaces", renderThisSubsurface);

        const removeHandler = (removed: WlSurface) => {
          if (removed.oid === daughter.oid) {
            if ((removed as any).previousBuffer) {
              (removed as any).previousBuffer.release?.();
              (removed as any).previousBuffer = undefined;
            }
            if ((removed as any).buffer) {
              (removed as any).buffer.release?.();
              (removed as any).buffer = undefined;
            }
            const removedCanvas = this.subsurfaceCanvases.get(removed.oid);
            if (removedCanvas) {
              removedCanvas.remove();
              this.subsurfaceCanvases.delete(removed.oid);
            }
            this.trackedSurfaces.delete(removed.oid);
            parentSurface.off?.("remove_subsurface", removeHandler);
          }
        };

        parentSurface.on("remove_subsurface", removeHandler);
      }

      if (daughter.daughterSurfaces && daughter.daughterSurfaces.size > 0) {
        this.trackSubsurfaceTree(daughter, absX, absY, zIndex + 1);
      }
    });
  }

  private setupWaylandEvents(): void {
    const toplevel = this.toplevel;
    const xdgSurface = toplevel.parent;
    const surface = xdgSurface.surface;

    const onSurfaceUpdate = () => {
      const buffer = surface.buffer as WlBufferExtended | null | undefined;
      const xdgGeom = xdgSurface.geometry;
      const geomOffsetX = xdgGeom && xdgGeom.width > 0 && xdgGeom.height > 0 ? -(xdgGeom.x || 0) : 0;
      const geomOffsetY = xdgGeom && xdgGeom.width > 0 && xdgGeom.height > 0 ? -(xdgGeom.y || 0) : 0;

      if (buffer) {
        if (!buffer.videoFrame && !buffer.importedSharedTexture && buffer._importPromise) {
          buffer._importPromise.then(() => {
            onSurfaceUpdate();
          });
          return;
        }

        const bufW = buffer.dmabufMeta?.width ?? buffer.meta?.width ?? buffer.videoFrame?.displayWidth ?? 640;
        const bufH = buffer.dmabufMeta?.height ?? buffer.meta?.height ?? buffer.videoFrame?.displayHeight ?? 480;

        if (xdgGeom && xdgGeom.width > 0 && xdgGeom.height > 0) {
          this.geometry.width = xdgGeom.width;
          this.geometry.height = xdgGeom.height;
          this.mainCanvas.style.left = `${geomOffsetX}px`;
          this.mainCanvas.style.top = `${geomOffsetY}px`;
        } else {
          this.geometry.width = bufW;
          this.geometry.height = bufH;
          this.mainCanvas.style.left = "0px";
          this.mainCanvas.style.top = "0px";
        }

        this.mainCanvas.width = bufW;
        this.mainCanvas.height = bufH;
        this.mainCanvas.style.width = `${bufW}px`;
        this.mainCanvas.style.height = `${bufH}px`;

        const painted = paintBufferToCanvas(buffer, this.mainCanvas, (surface as any).previousBuffer);
        if (painted) {
          (surface as any).previousBuffer = undefined;
        }
      } else {
        if ((surface as any).previousBuffer) {
          (surface as any).previousBuffer.release?.();
          (surface as any).previousBuffer = undefined;
        }
      }

      this.trackSubsurfaceTree(surface, geomOffsetX, geomOffsetY, 2);

      if (xdgSurface.daughterPopups && xdgSurface.daughterPopups.size > 0) {
        for (const popup of xdgSurface.daughterPopups) {
          const popupSurface = popup.parent?.surface;
          if (!popupSurface) continue;

          const popupBuffer = popupSurface.buffer as WlBufferExtended | null | undefined;
          if (!popupBuffer) {
            if ((popupSurface as any).previousBuffer) {
              (popupSurface as any).previousBuffer.release?.();
              (popupSurface as any).previousBuffer = undefined;
            }
            continue;
          }

          let popupCanvas = this.popupCanvases.get(popup.oid);
          if (!popupCanvas) {
            popupCanvas = document.createElement("canvas");
            popupCanvas.className = `popup-surface popup-${popup.oid}`;
            this.shadow.appendChild(popupCanvas);
            this.popupCanvases.set(popup.oid, popupCanvas);
            this.canvasToSurface.set(popupCanvas, popupSurface);

            popup.on("update", onSurfaceUpdate);
            popupSurface.on("update", onSurfaceUpdate);
          }

          const fromTo = typeof (popup as any).computeFromTo === "function" ? (popup as any).computeFromTo() : null;
          const px = (fromTo ? fromTo.from[1] : (popup.geometry?.x ?? 0)) + geomOffsetX;
          const py = (fromTo ? fromTo.from[0] : (popup.geometry?.y ?? 0)) + geomOffsetY;
          const pw = popupBuffer.dmabufMeta?.width ?? popupBuffer.meta?.width ?? popupBuffer.videoFrame?.displayWidth ?? 200;
          const ph = popupBuffer.dmabufMeta?.height ?? popupBuffer.meta?.height ?? popupBuffer.videoFrame?.displayHeight ?? 200;

          popupCanvas.width = pw;
          popupCanvas.height = ph;
          popupCanvas.style.left = `${px}px`;
          popupCanvas.style.top = `${py}px`;
          popupCanvas.style.width = `${pw}px`;
          popupCanvas.style.height = `${ph}px`;

          const painted = paintBufferToCanvas(popupBuffer, popupCanvas, (popupSurface as any).previousBuffer);
          if (painted) {
            (popupSurface as any).previousBuffer = undefined;
          }
        }
      }
    };

    surface.on("update", onSurfaceUpdate);
    surface.on("new_subsurface", () => onSurfaceUpdate());
    surface.on("restack_subsurfaces", () => onSurfaceUpdate());
    xdgSurface.on("new_popup", () => onSurfaceUpdate());

    toplevel.on("title", (title: string) => {
      this.title = title;
    });

    toplevel.on("app_id", (appId: string) => {
      this.appId = appId;
    });
  }

  private getSurfaceAndCoords(e: MouseEvent): { surface: WlSurface; surfaceX: number; surfaceY: number } | null {
    const rect = this.containerElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const hit = this.shadow.elementFromPoint(e.clientX, e.clientY) as HTMLCanvasElement | null;
    if (!hit) {
      return { surface: this.getSurface(), surfaceX: localX, surfaceY: localY };
    }

    const surface = this.canvasToSurface.get(hit) ?? this.getSurface();
    const hitRect = hit.getBoundingClientRect();
    const surfaceX = e.clientX - hitRect.left;
    const surfaceY = e.clientY - hitRect.top;

    return { surface, surfaceX, surfaceY };
  }

  private setupDOMInputEvents(): void {
    this.containerElement.addEventListener("mouseenter", (e: MouseEvent) => {
      const target = this.getSurfaceAndCoords(e);
      if (target) {
        this.currentPointerSurface = target.surface;
        this.sendPointerEnter(target.surface, target.surfaceX, target.surfaceY);
      }
    });

    this.containerElement.addEventListener("mousemove", (e: MouseEvent) => {
      const target = this.getSurfaceAndCoords(e);
      if (!target) return;

      if (this.currentPointerSurface && this.currentPointerSurface !== target.surface) {
        this.sendPointerLeave(this.currentPointerSurface);
        this.sendPointerEnter(target.surface, target.surfaceX, target.surfaceY);
        this.currentPointerSurface = target.surface;
      }

      this.sendPointerMove(target.surfaceX, target.surfaceY);
    });

    this.containerElement.addEventListener("mouseleave", () => {
      if (this.currentPointerSurface) {
        this.sendPointerLeave(this.currentPointerSurface);
        this.currentPointerSurface = null;
      }
    });

    this.containerElement.addEventListener("mousedown", (e: MouseEvent) => {
      this.focus();
      const hit = this.getSurfaceAndCoords(e);
      if (hit && this.currentPointerSurface !== hit.surface) {
        if (this.currentPointerSurface) {
          this.sendPointerLeave(this.currentPointerSurface);
        }
        this.currentPointerSurface = hit.surface;
        this.sendPointerEnter(hit.surface, hit.surfaceX, hit.surfaceY);
      }
      const linuxBtn = domButtonToLinuxButton(e.button);
      this.sendButtonDown(linuxBtn);
    });

    this.containerElement.addEventListener("mouseup", (e: MouseEvent) => {
      const linuxBtn = domButtonToLinuxButton(e.button);
      this.sendButtonUp(linuxBtn);
    });

    this.containerElement.addEventListener("keydown", (e: KeyboardEvent) => {
      const evdevKey = domCodeToLinuxKey(e.code, e.keyCode);
      const modMask = getModifiersMask(e);
      this.sendModifiers(modMask);
      this.sendKeyDown(evdevKey + 8, e.repeat);
    });

    this.containerElement.addEventListener("keyup", (e: KeyboardEvent) => {
      const evdevKey = domCodeToLinuxKey(e.code, e.keyCode);
      const modMask = getModifiersMask(e);
      this.sendModifiers(modMask);
      this.sendKeyUp(evdevKey + 8);
    });
  }

  public getSurface(): WlSurface {
    return this.toplevel.parent.surface;
  }

  public getSurfaceElement(): HTMLElement {
    return this.containerElement;
  }

  public configure(bounds: Partial<WindowGeometry>): void {
    this.geometry = { ...this.geometry, ...bounds };
    this.toplevel.configureSequence(true, false);
  }

  public focus(): void {
    this.activated = true;
    try {
      this.containerElement.focus({ preventScroll: true });
    } catch {
      this.containerElement.focus();
    }
    const seatInstances = this.getSeatInstances();
    const surface = this.getSurface();
    if (seatInstances && surface) {
      seatInstances.focus(surface, []);
    }
  }

  public blur(): void {
    this.activated = false;
    const seatInstances = this.getSeatInstances();
    const surface = this.getSurface();
    if (seatInstances && surface) {
      seatInstances.blur(surface);
    }
  }

  public close(): void {
    for (const cb of this.destroyListeners) {
      cb();
    }
  }

  public onDestroy(callback: () => void): () => void {
    this.destroyListeners.add(callback);
    return () => this.destroyListeners.delete(callback);
  }

  public enterOutput(outputConfig: OutputConfiguration): void {
    this.getSurface().enterOutput(outputConfig);
  }

  public leaveOutput(outputConfig: OutputConfiguration): void {
    this.getSurface().leaveOutput(outputConfig);
  }

  public sendPointerEnter(surface: WlSurface, surfaceX: number, surfaceY: number): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.enter(surface, surfaceX, surfaceY);
    }
  }

  public sendPointerMove(surfaceX: number, surfaceY: number): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.moveTo(surfaceX, surfaceY);
    }
  }

  public sendPointerLeave(surface: WlSurface): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.leave(surface);
    }
  }

  public sendModifiers(dep: number, latch = 0, lock = 0, group = 0): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.modifiers(dep, latch, lock, group);
    }
  }

  public sendKeyDown(keyCode: number, repeat = false): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.keyDown(keyCode, repeat);
    }
  }

  public sendKeyUp(keyCode: number): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.keyUp(keyCode);
    }
  }

  public sendButtonDown(button: number): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.buttonDown(button);
    }
  }

  public sendButtonUp(button: number): void {
    const seatInstances = this.getSeatInstances();
    if (seatInstances) {
      seatInstances.buttonUp(button);
    }
  }

  public sendScroll(deltaX: number, deltaY: number): void {
    // Scroll handling reserved for future Wayland axis events
  }
}

export default CathodiqueWindow;
