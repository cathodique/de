/**
 * Reference Window Manager Module for Cathodique.
 * Manages AbstractWindow instances using Informa reactive state and pure DOM UI.
 */

import $ from "informa";
import { AbstractWindow, type WindowGeometry } from "../../../core/window.js";

export interface ManagedWindow {
  id: string;
  window: AbstractWindow;
  hostElement?: HTMLElement;
  zIndex: number;
}

const managedWindows = new Map<string, ManagedWindow>();
let nextWindowId = 1;
let currentBaseZIndex = 100;
let workspaceElement: HTMLElement | undefined = undefined;

export function getWorkspaceElement(): HTMLElement | undefined {
  if (workspaceElement) return workspaceElement;
  if (typeof document !== "undefined") {
    try {
      workspaceElement = document.createElement("div");
      workspaceElement.className = "wm-workspace";
      workspaceElement.style.position = "absolute";
      workspaceElement.style.inset = "0";
      workspaceElement.style.width = "100%";
      workspaceElement.style.height = "100%";
      workspaceElement.style.pointerEvents = "none";
    } catch {}
  }
  return workspaceElement;
}

/**
 * Generic in-memory implementation of AbstractWindow for pure DOM/Web windows.
 */
export class GenericDesktopWindow extends AbstractWindow {
  public readonly id: string;
  private destroyListeners = new Set<() => void>();

  constructor(title = "Desktop Window", geometry?: Partial<WindowGeometry>) {
    super();
    this.id = `win-${nextWindowId++}`;
    this.title = title;
    if (geometry) {
      this.geometry = { ...this.geometry, ...geometry };
    }
  }

  public close(): void {
    for (const cb of this.destroyListeners) {
      try { cb(); } catch {}
    }
  }

  public focus(): void {
    this.activated = true;
  }

  public configure(bounds: Partial<WindowGeometry>): void {
    this.geometry = { ...this.geometry, ...bounds };
  }

  public onDestroy(callback: () => void): () => void {
    this.destroyListeners.add(callback);
    return () => this.destroyListeners.delete(callback);
  }
}

/**
 * Manages an AbstractWindow instance (Wayland surface, DOM window, etc.).
 */
export function manageWindow(winModel: AbstractWindow): ManagedWindow {
  const id = winModel.id;
  if (managedWindows.has(id)) return managedWindows.get(id)!;

  const zIndex = (currentBaseZIndex += 10);
  const geom = winModel.geometry ?? { x: 100, y: 100, width: 640, height: 480 };

  let hostElement: HTMLElement | undefined = undefined;
  let titlebarText: HTMLElement | undefined = undefined;

  if (typeof document !== "undefined") {
    try {
      hostElement = document.createElement("div");
      hostElement.className = "cathodique-toplevel";
      hostElement.style.position = "absolute";
      hostElement.style.left = `${geom.x}px`;
      hostElement.style.top = `${geom.y}px`;
      hostElement.style.width = `${geom.width}px`;
      hostElement.style.height = `${geom.height}px`;
      hostElement.style.zIndex = zIndex.toString();
      hostElement.style.display = "flex";
      hostElement.style.flexDirection = "column";
      hostElement.style.background = "#1e1e2e";
      hostElement.style.color = "#cdd6f4";
      hostElement.style.borderRadius = "8px";
      hostElement.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
      hostElement.style.border = "1px solid rgba(255,255,255,0.1)";
      hostElement.style.overflow = "hidden";
      hostElement.style.pointerEvents = "auto";

      // Focus window model on user click
      hostElement.addEventListener("mousedown", () => {
        winModel.focus();
        hostElement!.style.zIndex = (currentBaseZIndex += 10).toString();
      });

      const titlebar = document.createElement("div");
      titlebar.className = "titlebar";
      titlebar.style.height = "32px";
      titlebar.style.background = "#181825";
      titlebar.style.display = "flex";
      titlebar.style.alignItems = "center";
      titlebar.style.justifyContent = "space-between";
      titlebar.style.padding = "0 12px";
      titlebar.style.fontSize = "13px";
      titlebar.style.fontWeight = "600";
      titlebar.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
      titlebar.style.cursor = "move";

      titlebarText = document.createElement("span");
      titlebarText.className = "titlebar-text";
      titlebarText.textContent = winModel.title ?? "Untitled";
      titlebar.appendChild(titlebarText);

      // Titlebar buttons
      const btnContainer = document.createElement("div");
      btnContainer.style.display = "flex";
      btnContainer.style.gap = "6px";

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.style.background = "rgba(235, 77, 75, 0.2)";
      closeBtn.style.color = "#ff7675";
      closeBtn.style.border = "none";
      closeBtn.style.borderRadius = "4px";
      closeBtn.style.width = "18px";
      closeBtn.style.height = "18px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.display = "flex";
      closeBtn.style.alignItems = "center";
      closeBtn.style.justifyContent = "center";

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        winModel.close();
      });
      btnContainer.appendChild(closeBtn);
      titlebar.appendChild(btnContainer);

      // Dragging to move window
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let initialLeft = geom.x;
      let initialTop = geom.y;

      titlebar.addEventListener("mousedown", (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = parseInt(hostElement!.style.left, 10) || geom.x;
        initialTop = parseInt(hostElement!.style.top, 10) || geom.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
          if (!isDragging || !hostElement) return;
          const dx = moveEvent.clientX - dragStartX;
          const dy = moveEvent.clientY - dragStartY;
          const newX = initialLeft + dx;
          const newY = initialTop + dy;
          hostElement.style.left = `${newX}px`;
          hostElement.style.top = `${newY}px`;
          winModel.geometry = { ...winModel.geometry, x: newX, y: newY };
        };

        const onMouseUp = () => {
          isDragging = false;
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });

      hostElement.appendChild(titlebar);

      const body = document.createElement("div");
      body.className = "window-body";
      body.style.flex = "1";
      body.style.padding = "16px";
      body.textContent = `Window Content for ${winModel.title}`;
      hostElement.appendChild(body);

      const ws = getWorkspaceElement();
      if (ws) ws.appendChild(hostElement);
    } catch {}
  }

  const managed: ManagedWindow = {
    id,
    window: winModel,
    hostElement,
    zIndex,
  };

  // Informa reactive subscriptions on the abstract window
  const unsubTitle = $.onSet(() => winModel.title, (newTitle: string) => {
    if (titlebarText && typeof newTitle === "string") {
      titlebarText.textContent = newTitle;
    }
  });

  const unsubGeom = $.onSet(() => winModel.geometry, (newGeom: WindowGeometry) => {
    if (hostElement && newGeom) {
      if (newGeom.x !== undefined) hostElement.style.left = `${newGeom.x}px`;
      if (newGeom.y !== undefined) hostElement.style.top = `${newGeom.y}px`;
      if (newGeom.width !== undefined) hostElement.style.width = `${newGeom.width}px`;
      if (newGeom.height !== undefined) hostElement.style.height = `${newGeom.height}px`;
    }
  });

  winModel.onDestroy(() => {
    unsubTitle();
    unsubGeom();
    closeWindow(id);
  });

  managedWindows.set(id, managed);
  return managed;
}

export function createWindow(
  titleOrWindow: string | AbstractWindow,
  options: { geometry?: Partial<WindowGeometry>; [key: string]: unknown } = {}
): ManagedWindow {
  if (titleOrWindow instanceof AbstractWindow || (typeof titleOrWindow === "object" && titleOrWindow !== null && "id" in titleOrWindow)) {
    return manageWindow(titleOrWindow as AbstractWindow);
  }
  const win = new GenericDesktopWindow(titleOrWindow as string, options.geometry);
  return manageWindow(win);
}

export function closeWindow(id: string): boolean {
  const managed = managedWindows.get(id);
  if (!managed) return false;
  if (managed.hostElement?.parentNode) {
    managed.hostElement.parentNode.removeChild(managed.hostElement);
  }
  managedWindows.delete(id);
  return true;
}

export function listWindows(): ManagedWindow[] {
  return Array.from(managedWindows.values());
}

export default {
  createWindow,
  manageWindow,
  closeWindow,
  listWindows,
  getWorkspaceElement,
};
