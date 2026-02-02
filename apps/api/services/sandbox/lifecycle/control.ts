import { cleanupExpiredSandboxContainers } from './cleanup.js';
import { setCleanupInterval, cleanupInterval, CLEANUP_INTERVAL_MS } from './state.js';

export async function initSandboxService(): Promise<void> {
  await cleanupExpiredSandboxContainers();

  const timer = setInterval(async () => {
    await cleanupExpiredSandboxContainers();
  }, CLEANUP_INTERVAL_MS);

  setCleanupInterval(timer);
}

export async function shutdownSandboxService(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    setCleanupInterval(null);
  }
}
