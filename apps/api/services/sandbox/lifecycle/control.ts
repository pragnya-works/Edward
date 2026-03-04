import { cleanupExpiredSandboxContainers } from "./cleanup.js";
import { CLEANUP_INTERVAL_MS } from "./state.js";
import { pingDocker } from "../docker.service.js";
import { config } from "../../../app.config.js";
import { createLogger } from "../../../utils/logger.js";

let cleanupInterval: NodeJS.Timeout | null = null;
const logger = createLogger("SANDBOX_LIFECYCLE");

function startCleanupInterval(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void cleanupExpiredSandboxContainers().catch((error: unknown) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Sandbox cleanup interval failed",
      );
    });
  }, CLEANUP_INTERVAL_MS);

  timer.unref();
  return timer;
}

export function isSandboxEnabled(): boolean {
  return config.sandbox.enabled;
}

export async function isSandboxRuntimeAvailable(): Promise<boolean> {
  if (!isSandboxEnabled()) {
    return true;
  }
  return pingDocker();
}

export async function initSandboxService(): Promise<void> {
  if (!isSandboxEnabled()) {
    return;
  }

  if (cleanupInterval) {
    return;
  }

  if (!(await isSandboxRuntimeAvailable())) {
    throw new Error(
      "Sandbox service is enabled but Docker runtime is unavailable.",
    );
  }

  await cleanupExpiredSandboxContainers();

  cleanupInterval = startCleanupInterval();
}

export async function shutdownSandboxService(): Promise<void> {
  if (!isSandboxEnabled()) {
    return;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
