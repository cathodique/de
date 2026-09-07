/**
 * Cathodique Sample Window Manager Module (@cathodique/sample-wm).
 * Manages windows in the "desktop-workspace" layer.
 * Implements @cathodique/wm-iface.
 */

import $ from "informa";
import { AbstractWindow, type WindowGeometry } from "@cathodique/window-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";
import type { WindowManager as IWindowManager, ManagedWindow } from "@cathodique/wm-iface";
import { trackMouseRelease } from "@cathodique/global-io";

export { ManagedWindow };

let nextGenericWinId = 1;

export class GenericDesktopWindow extends AbstractWindow {
  public readonly id: string;
  private destroyListeners = new Set<() => void>();
  private contentElement: HTMLElement;

  constructor(title = "Desktop Window", geometry?: Partial<WindowGeometry>) {
    super();
    this.id = `win-${nextGenericWinId++}`;
    this.title = title;
    this.geometry = {
      x: 120,
      y: 100,
      width: 640,
      height: 420,
      ...geometry,
    };

    this.contentElement = document.createElement("div");
    this.contentElement.style.width = "100%";
    this.contentElement.style.height = "100%";
    this.contentElement.style.padding = "20px";
    this.contentElement.style.color = "#ddd";
    this.contentElement.style.fontFamily = "system-ui, -apple-system, sans-serif";
    this.contentElement.innerHTML = `
      <h3 style="margin-top:0; color:#fff;">${title}</h3>
      <p>Cathodique Modular Desktop Environment is running in an isolated SES compartment.</p>
    `;
  }

  public getSurfaceElement(): HTMLElement {
    return this.contentElement;
  }

  public close(): void {
    for (const cb of this.destroyListeners) {
      cb();
    }
  }

  public focus(): void {
    this.activated = true;
  }

  public blur(): void {
    this.activated = false;
  }

  public configure(bounds: Partial<WindowGeometry>): void {
    this.geometry = { ...this.geometry, ...bounds };
  }

  public onDestroy(callback: () => void): () => void {
    this.destroyListeners.add(callback);
    return () => this.destroyListeners.delete(callback);
  }
}

export class SampleWindowManager implements IWindowManager {
  static readonly [IS_COMPONENT] = true;

  private managedWindows = new Map<string, ManagedWindow>();
  private currentBaseZIndex = 100;
  private workspaceElement: HTMLElement;

  constructor() {
    this.workspaceElement = this.createWorkspace();
  }

  private createWorkspace(): HTMLElement {
    const ws = document.createElement("div");
    ws.className = "cathodique-workspace";
    ws.style.position = "absolute";
    ws.style.inset = "0";
    ws.style.width = "100%";
    ws.style.height = "100%";
    ws.style.overflow = "hidden";
    ws.style.pointerEvents = "auto";
    return ws;
  }

  public getWorkspaceElement(): HTMLElement {
    return this.workspaceElement;
  }

  public manageWindow(targetWindow: AbstractWindow): ManagedWindow {
    const existing = this.managedWindows.get(targetWindow.id);
    if (existing) return existing;

    const z = this.currentBaseZIndex++;
    const host = document.createElement("div");
    host.className = `window-frame window-${targetWindow.id}`;
    host.style.position = "absolute";
    host.style.left = `${targetWindow.geometry.x || 100}px`;
    host.style.top = `${targetWindow.geometry.y || 80}px`;
    host.style.width = `${targetWindow.geometry.width || 640}px`;
    host.style.height = `${targetWindow.geometry.height || 420}px`;
    host.style.zIndex = `${z}`;
    host.style.pointerEvents = "auto";
    host.style.backgroundColor = "rgba(26, 27, 38, 0.92)";
    host.style.backdropFilter = "blur(16px)";
    host.style.borderRadius = "10px";
    host.style.boxShadow = "0 12px 40px rgba(0, 0, 0, 0.5)";
    host.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    host.style.overflow = "hidden";
    host.style.display = "flex";
    host.style.flexDirection = "column";

    // Window Titlebar
    const titleBar = document.createElement("div");
    titleBar.className = "window-titlebar";
    titleBar.style.height = "34px";
    titleBar.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
    titleBar.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.style.justifyContent = "space-between";
    titleBar.style.padding = "0 12px";
    titleBar.style.userSelect = "none";
    titleBar.style.cursor = "grab";

    const titleText = document.createElement("span");
    titleText.className = "window-title-text";
    titleText.textContent = targetWindow.title || "Window";
    titleText.style.color = "#e0e0e0";
    titleText.style.fontSize = "13px";
    titleText.style.fontWeight = "500";
    titleText.style.fontFamily = "system-ui, -apple-system, sans-serif";
    titleBar.appendChild(titleText);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#888";
    closeBtn.style.fontSize = "14px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "2px 6px";
    closeBtn.style.borderRadius = "4px";
    closeBtn.onmouseenter = () => { closeBtn.style.color = "#ff5555"; };
    closeBtn.onmouseleave = () => { closeBtn.style.color = "#888"; };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      targetWindow.close();
    };
    titleBar.appendChild(closeBtn);

    const bringToFront = () => {
      const newZ = this.currentBaseZIndex++;
      host.style.zIndex = `${newZ}`;
      const entry = this.managedWindows.get(targetWindow.id);
      if (entry) entry.zIndex = newZ;
      targetWindow.focus();
    };

    // Titlebar Dragging via GlobalIO
    titleBar.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.target === closeBtn) return;
      e.preventDefault();

      bringToFront();

      titleBar.style.cursor = "grabbing";
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWinX = targetWindow.geometry.x ?? host.offsetLeft;
      const initialWinY = targetWindow.geometry.y ?? host.offsetTop;
      const doc = host.ownerDocument ?? document;

      const onMouseMove = (moveEvt: MouseEvent) => {
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        const newX = initialWinX + dx;
        const newY = initialWinY + dy;

        targetWindow.geometry.x = newX;
        targetWindow.geometry.y = newY;
        host.style.left = `${newX}px`;
        host.style.top = `${newY}px`;
      };

      doc.addEventListener("mousemove", onMouseMove, true);

      trackMouseRelease(e, () => {
        titleBar.style.cursor = "grab";
        doc.removeEventListener("mousemove", onMouseMove, true);
      });
    });

    // Bring to front on window click
    host.addEventListener("mousedown", () => {
      bringToFront();
    });

    host.appendChild(titleBar);

    const surfaceContainer = document.createElement("div");
    surfaceContainer.style.flex = "1";
    surfaceContainer.style.position = "relative";
    surfaceContainer.style.overflow = "hidden";

    const surfaceElement = targetWindow.getSurfaceElement?.();
    if (surfaceElement) {
      surfaceContainer.appendChild(surfaceElement);
    }
    host.appendChild(surfaceContainer);

    this.workspaceElement.appendChild(host);

    const managed: ManagedWindow = {
      id: targetWindow.id,
      window: targetWindow,
      hostElement: host,
      zIndex: z,
    };

    targetWindow.onDestroy(() => {
      host.remove();
      this.managedWindows.delete(targetWindow.id);
    });

    this.managedWindows.set(targetWindow.id, managed);
    return managed;
  }

  public unmanageWindow(windowOrId: AbstractWindow | string): void {
    const id = typeof windowOrId === "string" ? windowOrId : windowOrId.id;
    const managed = this.managedWindows.get(id);
    if (managed) {
      managed.hostElement.remove();
      this.managedWindows.delete(id);
    }
  }

  public getManagedWindows(): ManagedWindow[] {
    return Array.from(this.managedWindows.values());
  }

  public getWindows(): ManagedWindow[] {
    return this.getManagedWindows();
  }
}

export default SampleWindowManager;
