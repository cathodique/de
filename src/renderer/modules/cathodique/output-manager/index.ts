/**
 * Cathodique OutputManager Subsystem (@cathodique/output-manager).
 */

import $ from "informa";
import type { AbstractWindow } from "@cathodique/window-iface";
import type { Output, OutputConfiguration, IOutput } from "@cathodique/output-iface";
import type { OutputManager as IOutputManager } from "@cathodique/output-manager-iface";
import { IS_COMPONENT } from "@cathodique/init-iface";
import type { OutputRegistry } from "@cathodique/wl-serv-high/registries";

export class OutputManager implements IOutputManager {
  static readonly [IS_COMPONENT] = true;

  public outputs = new Map<string, IOutput>();
  public registry?: OutputRegistry;
  public rootElement: HTMLElement;
  private trackedWindows = new Map<AbstractWindow, () => void>();
  private outputFactory?: (config: OutputConfiguration) => IOutput;

  constructor(registry?: OutputRegistry, outputFactory?: (config: OutputConfiguration) => IOutput) {
    this.registry = registry;
    this.outputFactory = outputFactory;
    this.rootElement = this.createRootElement();

    const handleViewportResize = () => {
      this.refreshFromDOM();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleViewportResize);
    }
  }

  private createRootElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cathodique-outputs-root";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.overflow = "hidden";
    el.style.pointerEvents = "none";
    return el;
  }

  public getRootElement(): HTMLElement {
    return this.rootElement;
  }

  public attachToContainer(container: HTMLElement): void {
    container.appendChild(this.rootElement);
  }

  public registerOutput(outputOrConfig: IOutput | OutputConfiguration): IOutput {
    let output: IOutput;

    if ("containerElement" in outputOrConfig && typeof outputOrConfig.attachToContainer === "function") {
      output = outputOrConfig;
    } else {
      const config = outputOrConfig as OutputConfiguration;
      if (this.outputFactory) {
        output = this.outputFactory(config);
      } else {
        const id = config.id ?? `out-${Math.random().toString(36).slice(2, 7)}`;
        output = {
          id,
          config: { ...config, id },
          containerElement: document.createElement("div"),
          attachToContainer: (parent: HTMLElement) => {
            parent.appendChild(output.containerElement);
          },
          detachFromContainer: () => {
            if (output.containerElement.parentNode) {
              output.containerElement.parentNode.removeChild(output.containerElement);
            }
          },
          updateConfiguration: (newConfig: Partial<OutputConfiguration>) => {
            Object.assign(output.config, newConfig);
          },
        };
      }
    }

    this.outputs.set(output.id, output);
    output.attachToContainer(this.rootElement);

    if (this.registry) {
      this.registry.addAuthority(output.config);
    }

    return output;
  }

  public unregisterOutput(outputOrId: IOutput | string): void {
    const id = typeof outputOrId === "string" ? outputOrId : outputOrId.id;
    const output = this.outputs.get(id);
    if (output) {
      output.detachFromContainer();
      if (this.registry) {
        this.registry.removeAuthority(output.config);
      }
      this.outputs.delete(id);
    }
  }

  public getOutputs(): IOutput[] {
    return Array.from(this.outputs.values());
  }

  public getOutput(id: string): IOutput | undefined {
    return this.outputs.get(id);
  }

  public getOutputForElement(element: HTMLElement): IOutput | undefined {
    for (const output of this.outputs.values()) {
      if (output.containerElement.contains(element)) {
        return output;
      }
    }
    return undefined;
  }

  public trackWindow(window: AbstractWindow): () => void {
    const updateIntersections = () => {
      const currentIntersections = this.checkWindowIntersections(window);
      for (const output of currentIntersections) {
        if (typeof window.enterOutput === "function") {
          window.enterOutput(output.config);
        }
      }
    };

    updateIntersections();

    const cleanup = () => {
      this.trackedWindows.delete(window);
    };

    this.trackedWindows.set(window, cleanup);
    return cleanup;
  }

  public checkWindowIntersections(window: AbstractWindow): IOutput[] {
    const intersecting: IOutput[] = [];
    const winGeo = window.geometry;

    for (const output of this.outputs.values()) {
      const outConfig = output.config;
      const outWidth = outConfig.width ?? outConfig.w ?? outConfig.effectiveW ?? 1920;
      const outHeight = outConfig.height ?? outConfig.h ?? outConfig.effectiveH ?? 1080;
      const overlaps =
        winGeo.x < outConfig.x + outWidth &&
        winGeo.x + winGeo.width > outConfig.x &&
        winGeo.y < outConfig.y + outHeight &&
        winGeo.y + winGeo.height > outConfig.y;

      if (overlaps) {
        intersecting.push(output);
      }
    }

    return intersecting;
  }

  public refreshFromDOM(): void {
    for (const output of this.outputs.values()) {
      if (output.containerElement) {
        const rect = output.containerElement.getBoundingClientRect();
        output.updateConfiguration({
          width: rect.width,
          height: rect.height,
        });
      }
    }
  }
}

export function createOutputManager(
  registry?: OutputRegistry,
  outputFactory?: (config: OutputConfiguration) => IOutput
): OutputManager {
  return new OutputManager(registry, outputFactory);
}

export default OutputManager;
