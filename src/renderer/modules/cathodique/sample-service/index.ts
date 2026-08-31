/**
 * Reference Service Module for Cathodique.
 */

let isRunning = false;

export async function start(): Promise<void> {
  isRunning = true;
  console.log("[SampleService] Service started.");
}

export async function stop(): Promise<void> {
  isRunning = false;
  console.log("[SampleService] Service stopped.");
}

export function status(): "running" | "stopped" | "error" {
  return isRunning ? "running" : "stopped";
}

export default {
  start,
  stop,
  status,
};
