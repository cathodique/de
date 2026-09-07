/**
 * Reference Service Module for Cathodique.
 * Implements @cathodique/service-iface.
 */

import { IS_COMPONENT } from "@cathodique/init-iface";
import type { Service as IService } from "@cathodique/service-iface";

export class SampleService implements IService {
  static readonly [IS_COMPONENT] = true;

  private isRunning = false;

  public async start(): Promise<void> {
    this.isRunning = true;
    console.log("[@cathodique/sample-service] [SampleService] Service started.");
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    console.log("[@cathodique/sample-service] [SampleService] Service stopped.");
  }

  public status(): "running" | "stopped" | "error" {
    return this.isRunning ? "running" : "stopped";
  }
}

export function createService(): SampleService {
  return new SampleService();
}

export default SampleService;
