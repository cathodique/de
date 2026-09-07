/**
 * Cathodique Privileged Init Module (PID 1 of Desktop Environment).
 * Orchestrates iframe viewport, Wayland compositor, and system subsystems.
 * Bridges Wayland toplevel surfaces into CathodiqueWindow instances for Window Managers.
 */

import $ from "informa";
import type { InitModuleContext } from "../../../core/types.js";
import type { CathodiqueWindow } from "@cathodique/window-iface";
import type { OutputManager } from "@cathodique/output-manager-iface";
import type { LayerLoader } from "@cathodique/layer-iface";
import type { WindowManager } from "@cathodique/wm-iface";
import type { Service } from "@cathodique/service-iface";
import type { HLCompositor, HLConnection } from "@cathodique/wl-serv-high";
import type { OutputRegistry, SeatRegistry, StrutRegistry } from "@cathodique/wl-serv-high/registries";
import type { XdgToplevel, WlBuffer } from "@cathodique/wl-serv-high/objects";
import type { WlBufferExtended } from "../window/index.js";

export async function init(context: InitModuleContext) {
  const { loader, membrane, iframeElement, require: hostRequire, DmabufBridgeClient } = context;
  console.log("[Init / PID 1] Bootstrapping Cathodique Desktop Environment...");

  const targetIframe = iframeElement ?? document.querySelector("iframe")!;
  const iframeViewport = membrane.initScriptlessIframe(targetIframe);
  console.log("[Init] Scriptless iframe viewport initialized successfully.");

  // Subsystems loaded dynamically via loader contracts
  const windowMod = await loader.loadModule<{
    CathodiqueWindow: new (toplevel: XdgToplevel, seats?: SeatRegistry) => CathodiqueWindow;
  }>("@cathodique/window");
  const WindowCtor = (windowMod.exports.CathodiqueWindow ?? windowMod.exports.default) as new (
    toplevel: XdgToplevel,
    seats?: SeatRegistry
  ) => CathodiqueWindow;

  const outputManagerMod = await loader.loadModule<{
    OutputManager: new (registry?: OutputRegistry) => OutputManager;
  }>("@cathodique/output-manager");
  const OutputManagerCtor = (outputManagerMod.exports.OutputManager ?? outputManagerMod.exports.default) as new (
    registry?: OutputRegistry
  ) => OutputManager;

  const subsystems = new Map<string, unknown>();
  let compositor: HLCompositor | undefined = undefined;
  let activeSeats: SeatRegistry | undefined = undefined;
  let activeWindowManager: WindowManager | undefined = undefined;
  let rafId: number | undefined = undefined;

  // 1. One-Way Hierarchical Subsystem Orchestration
  // 1a. Spawn Layer Loader Subsystem (loads & creates all standard layers on construction)
  const layerloader = await loader.spawn<LayerLoader>("@cathodique/layerloader");
  subsystems.set("@cathodique/layerloader", layerloader);

  const layersRoot = layerloader.getRootElement();
  if (layersRoot) {
    const unwrappedRoot = membrane.unwrapNode(layersRoot) as HTMLElement;
    iframeViewport.root.appendChild(unwrappedRoot);
    console.log("[Init] Mounted LayerLoader root to iframe viewport.");
  }

  // 1b. Spawn Window Manager Subsystem
  const wm = await loader.spawn<WindowManager>("@cathodique/sample-wm");
  subsystems.set("@cathodique/sample-wm", wm);
  activeWindowManager = wm;

  if (wm && typeof wm.getWorkspaceElement === "function") {
    const wsElement = wm.getWorkspaceElement();
    if (wsElement) {
      const unwrappedWs = membrane.unwrapNode(wsElement) as HTMLElement;
      layerloader.attachToLayer("desktop-workspace", unwrappedWs);
      console.log("[Init] Attached Sample WM workspace to 'desktop-workspace' layer.");
    }
  }

  // 1c. Spawn Sample Background Service
  const service = await loader.spawn<Service>("@cathodique/sample-service");
  subsystems.set("@cathodique/sample-service", service);
  if (service && typeof service.start === "function") {
    await service.start();
  }

  // 2. Wayland Compositor Subsystem
  const req = hostRequire ?? (typeof require !== "undefined" ? require : null);

  if (req) {
    const { HLCompositor: HLCompClass } = req("@cathodique/wl-serv-high") as {
      HLCompositor: typeof HLCompositor;
    };
    const { OutputRegistry: OutRegClass, SeatRegistry: SeatRegClass, StrutRegistry: StrutRegClass } = req(
      "@cathodique/wl-serv-high/registries"
    ) as {
      OutputRegistry: typeof OutputRegistry;
      SeatRegistry: typeof SeatRegistry;
      StrutRegistry: typeof StrutRegistry;
    };

    if (HLCompClass && OutRegClass && SeatRegClass && StrutRegClass) {
      const outputs = new OutRegClass();
      outputs.addAuthority({
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
        effectiveW: 1920,
        effectiveH: 1080,
      });

      const outputManager = new OutputManagerCtor(outputs);
      subsystems.set("@cathodique/output-manager", outputManager);

      const outputsRoot = outputManager.getRootElement();
      if (outputsRoot) {
        const unwrappedOutputs = membrane.unwrapNode(outputsRoot) as HTMLElement;
        layerloader.attachToLayer("desktop-workspace", unwrappedOutputs);
      }

      const seats = new SeatRegClass();
      seats.addAuthority({
        name: "default",
        capabilities: 7, // keyboard | pointer | touch
      });
      activeSeats = seats;

      const struts = new StrutRegClass();

      compositor = new HLCompClass({
        wl_registry: { outputs, seats, struts },
      });

      // Initialize DMA-BUF bridge client if host provided it and electron IPC is available
      const electronMod = req("electron");
      let dmabufBridgeClient: any = null;
      if (electronMod?.ipcRenderer && DmabufBridgeClient) {
        const socketPath = (await electronMod.ipcRenderer.invoke("getDmabufBridgeSocketPath")) as string;
        if (socketPath) {
          dmabufBridgeClient = new DmabufBridgeClient(electronMod.sharedTexture);
          await dmabufBridgeClient.connect(socketPath);
          console.log(`[Init / Wayland] Connected to DMA-BUF bridge at ${socketPath}`);
        }
      }

      // Bridge raw xdg_toplevel to CathodiqueWindow instances for Window Managers
      compositor.on("connection", (conn: HLConnection) => {
        conn.on("new_obj", (obj: { iface: string; oid: number; [key: string]: unknown }) => {
          if (obj.iface === "wl_buffer") {
            const buf = obj as unknown as WlBufferExtended;
            const isDmabuf = (buf as { isDmabuf?: boolean }).isDmabuf === true ||
              !!(buf.meta as { planes?: unknown[] } | undefined)?.planes ||
              !!buf.dmabufMeta?.planes;
            if (isDmabuf) {
              console.log(`[Init / Wayland] New dmabuf wl_buffer registered (oid: ${obj.oid})`);
              if (dmabufBridgeClient) {
                dmabufBridgeClient.importBuffer(buf);
              }
            }
          } else if (obj.iface === "xdg_toplevel") {
            const toplevel = obj as unknown as XdgToplevel;
            console.log(`[Init / Wayland] New xdg_toplevel registered (oid: ${toplevel.oid})`);
            const targetWm = activeWindowManager ?? (subsystems.get("@cathodique/sample-wm") as WindowManager);
            if (targetWm) {
              // Window manager receives the strictly typed CathodiqueWindow
              const windowModel = new WindowCtor(toplevel, activeSeats);

              // Track window intersections with all registered outputs
              outputManager.trackWindow(windowModel);

              if (typeof targetWm.manageWindow === "function") {
                targetWm.manageWindow(windowModel);
              }
            }
          }
        });
      });

      await compositor.start();
      const displaySocket = compositor.params?.socketPath ?? "wayland-0";
      console.log(`[Init / Wayland] Compositor started on socket: ${displaySocket}`);

      // Register allocated socket with Main process delete queue for reliable exit cleanup
      if (electronMod?.ipcRenderer && displaySocket) {
        electronMod.ipcRenderer.send("addToDeleteQueue", displaySocket);
        electronMod.ipcRenderer.send("addToDeleteQueue", `${displaySocket}.lock`);
      }
    }
  }

  // 3. Reactivity Animation Frame Loop (Informa stats + window sync + Wayland tick authority)
  const renderLoop = () => {
    // Drive Wayland compositor frame callbacks on every display refresh tick
    if (compositor?.ticks) {
      compositor.ticks.emit("tick");
    }

    if (activeWindowManager && typeof (activeWindowManager as any).getManagedWindows === "function") {
      const managed = (activeWindowManager as any).getManagedWindows();
      for (const mw of managed) {
        if (mw.hostElement && mw.window?.geometry) {
          const geo = mw.window.geometry;
          if (geo.width > 0 && geo.height > 0) {
            const curLeft = `${geo.x}px`;
            const curTop = `${geo.y}px`;
            const curWidth = `${geo.width}px`;
            const curHeight = `${geo.height}px`;

            if (mw.hostElement.style.left !== curLeft) mw.hostElement.style.left = curLeft;
            if (mw.hostElement.style.top !== curTop) mw.hostElement.style.top = curTop;
            if (mw.hostElement.style.width !== curWidth) mw.hostElement.style.width = curWidth;
            if (mw.hostElement.style.height !== curHeight) mw.hostElement.style.height = curHeight;
          }
        }
      }
    }

    rafId = requestAnimationFrame(renderLoop);
  };

  rafId = requestAnimationFrame(renderLoop);

  const cleanupCompositor = () => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    if (compositor) {
      compositor.close();
      const sockPath = compositor.params?.socketPath;
      if (sockPath && req) {
        try {
          (req("node:fs") as typeof import("node:fs")).rmSync(sockPath, { force: true });
        } catch {}
        try {
          (req("node:fs") as typeof import("node:fs")).rmSync(`${sockPath}.lock`, { force: true });
        } catch {}
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", cleanupCompositor);
    window.addEventListener("unload", cleanupCompositor);
  }

  return {
    subsystems,
    compositor,
    destroy: cleanupCompositor,
  };
}

export default init;
