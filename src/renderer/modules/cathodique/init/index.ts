/**
 * Cathodique Privileged Init Module (PID 1 of Desktop Environment).
 * Orchestrates iframe viewport, Wayland compositor, and system subsystems.
 * Bridges Wayland toplevel surfaces into Informa-statified AbstractWindow instances.
 */

import $ from "informa";
import type { InitModuleContext } from "../../../core/types.js";
import { AbstractWindow, type WindowGeometry } from "../../../core/window.js";

/**
 * Concrete AbstractWindow adapter bridging a Wayland XdgToplevel to the Window Manager.
 * Changes to title, geometry, and status reactively notify the Window Manager via Informa.
 */
export class WaylandToplevelWindow extends AbstractWindow {
  public readonly id: string;
  private toplevel: any;
  private seats?: any;
  private destroyListeners = new Set<() => void>();

  constructor(toplevel: any, seats?: any) {
    super();
    this.toplevel = toplevel;
    this.seats = seats;
    this.id = `wayland-${toplevel.oid}`;
    this.title = toplevel.title ?? "Wayland Window";
    this.appId = toplevel.appId;

    // wl-serv-high BaseObject is statified with Informa: sync title and appId reactively
    $.onSet(() => toplevel.title, (newTitle: string) => {
      if (typeof newTitle === "string") this.title = newTitle;
    });
    $.onSet(() => toplevel.appId, (newAppId: string) => {
      if (typeof newAppId === "string") this.appId = newAppId;
    });

    // Also listen for Wayland protocol destroy events
    if (typeof toplevel.on === "function") {
      toplevel.on("destroy", () => {
        for (const cb of this.destroyListeners) {
          try { cb(); } catch { }
        }
      });
    }
  }

  public close(): void {
    if (typeof this.toplevel.addCommand === "function") {
      this.toplevel.addCommand("close", {});
    } else if (typeof this.toplevel.wlDestroy === "function") {
      this.toplevel.wlDestroy();
    }
  }

  public focus(): void {
    this.activated = true;
    if (this.toplevel.parent?.surface && this.seats) {
      for (const seatAuth of this.seats.values()) {
        const instances = seatAuth.get(this.toplevel.connection);
        if (instances && typeof instances.focus === "function") {
          instances.focus(this.toplevel.parent.surface, []);
        }
      }
    }
  }

  public configure(bounds: Partial<WindowGeometry>): void {
    if (bounds) {
      this.geometry = { ...this.geometry, ...bounds };
    }
    if (typeof this.toplevel.configureSequence === "function") {
      this.toplevel.configureSequence(true, false);
    }
  }

  public onDestroy(callback: () => void): () => void {
    this.destroyListeners.add(callback);
    return () => this.destroyListeners.delete(callback);
  }
}

export async function init(context: InitModuleContext) {
  const { loader, membrane, iframeElement, require: hostRequire } = context;
  console.log("[Init / PID 1] Bootstrapping Cathodique Desktop Environment...");

  let iframeViewport: { document: Document; root: HTMLElement } | undefined;
  if (iframeElement) {
    try {
      iframeViewport = membrane.initScriptlessIframe(iframeElement);
      console.log("[Init] Scriptless iframe viewport initialized.");
    } catch (e) {
      console.warn("[Init] Viewport initialization note:", e);
    }
  }

  const subsystems = new Map<string, any>();
  let compositor: any = undefined;
  let activeSeats: any = undefined;
  let activeWindowManager: any = undefined;

  // 1. Wayland Compositor Subsystem
  const req = hostRequire ?? (typeof require !== "undefined" ? require : null);

  if (req) {
    try {
      const { HLCompositor } = req("@cathodique/wl-serv-high");
      const { OutputRegistry, SeatRegistry, StrutRegistry } = req("@cathodique/wl-serv-high/registries");

      if (HLCompositor && OutputRegistry && SeatRegistry && StrutRegistry) {
        const outputs = new OutputRegistry();
        outputs.addAuthority({
          x: 0,
          y: 0,
          w: 1920,
          h: 1080,
          effectiveW: 1920,
          effectiveH: 1080,
        });

        const seats = new SeatRegistry();
        seats.addAuthority({
          name: "default",
          capabilities: 7, // keyboard | pointer | touch
        });
        activeSeats = seats;

        const struts = new StrutRegistry();

        compositor = new HLCompositor({
          wl_registry: { outputs, seats, struts },
        });

        // Adapt raw xdg_toplevel to AbstractWindow and pass to Window Manager
        compositor.on("connection", (conn: any) => {
          conn.on("new_obj", (obj: any) => {
            if (obj.iface === "xdg_toplevel") {
              console.log(`[Init / Wayland] New xdg_toplevel registered (oid: ${obj.oid})`);
              const wm = activeWindowManager ?? subsystems.get("@cathodique/wm-iface");
              if (wm) {
                const windowModel = new WaylandToplevelWindow(obj, activeSeats);
                if (typeof wm.manageWindow === "function") {
                  wm.manageWindow(windowModel);
                } else if (typeof wm.createWindow === "function") {
                  wm.createWindow(windowModel);
                }
              }
            }
          });
        });

        await compositor.start();
        console.log(`[Init / Wayland] Compositor started at socket: ${compositor.params?.socketPath}`);

        // Register socket for deletion on exit
        try {
          const { ipcRenderer } = req("electron");
          if (ipcRenderer && compositor.params?.socketPath) {
            ipcRenderer.send("addToDeleteQueue", compositor.params.socketPath);
            ipcRenderer.send("addToDeleteQueue", `${compositor.params.socketPath}.lock`);
          }
        } catch { }
      }
    } catch (err) {
      console.warn("[Init / Wayland] Compositor startup note:", err);
    }
  }

  // 2. Subsystem Orchestration
  try {
    // 2a. Layer Loader Subsystem
    const layerloader = await loader.spawn<any>("@cathodique/layer-iface", "@cathodique/layerloader");
    subsystems.set("@cathodique/layer-iface", layerloader);

    if (layerloader && typeof layerloader.createLayer === "function") {
      const defaultLayers = [
        { name: "background", z: 0 },
        { name: "desktop-workspace", z: 100 },
        { name: "windows", z: 500 },
        { name: "overlays-panel", z: 1000 },
        { name: "lockscreen", z: 9999 },
      ];

      for (const conf of defaultLayers) {
        const layer = layerloader.createLayer(conf.name, conf.z);
        if (layer.hostElement && iframeViewport) {
          iframeViewport.root.appendChild(membrane.unwrapNode(layer.hostElement) as HTMLElement);
        }
      }
    }

    // 2b. Window Manager Subsystem
    const wm = await loader.spawn<any>("@cathodique/wm-iface", "@cathodique/sample-wm");
    subsystems.set("@cathodique/wm-iface", wm);
    activeWindowManager = wm;

    if (wm && typeof wm.getWorkspaceElement === "function") {
      const workspace = wm.getWorkspaceElement();
      if (workspace) {
        const windowsLayer = layerloader?.getLayer?.("windows")?.hostElement;
        const targetParent = windowsLayer ? membrane.unwrapNode(windowsLayer) as HTMLElement : iframeViewport?.root;
        if (targetParent) {
          targetParent.appendChild(membrane.unwrapNode(workspace) as HTMLElement);
        }
      }
    }

    // 2c. Service Subsystem
    const service = await loader.spawn<any>("@cathodique/service-iface", "@cathodique/sample-service");
    subsystems.set("@cathodique/service-iface", service);
    if (service && typeof service.start === "function") {
      await service.start();
    }
  } catch (err) {
    console.warn("[Init] Subsystem spawn note:", err);
  }

  console.log(`[Init / PID 1] Desktop Environment Ready.`);

  return {
    loader,
    compositor,
    subsystems,
    iframeViewport,
    shutdown: async () => {
      for (const sub of subsystems.values()) {
        if (typeof sub?.stop === "function") await sub.stop();
      }
      if (compositor?.destroy) compositor.destroy();
    },
  };
}

export default init;
