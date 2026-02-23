import { cleanupExpiredSandboxContainers } from './cleanup.js';
import { CLEANUP_INTERVAL_MS } from "./state.js";

let cleanupInterval: NodeJS.Timeout | null = null;

export async function initSandboxService(): Promise<void> {
  await cleanupExpiredSandboxContainers();

  const timer = setInterval(async () => {
    await cleanupExpiredSandboxContainers();
  }, CLEANUP_INTERVAL_MS);

  cleanupInterval = timer;
}

export async function shutdownSandboxService(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
