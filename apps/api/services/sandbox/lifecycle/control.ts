import { cleanupExpiredSandboxContainers } from "./cleanup.js";
import { CLEANUP_INTERVAL_MS } from "./state.js";
import { pingDocker } from "../docker.service.js";
import { config } from "../../../app.config.js";
import { createLogger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";

let cleanupInterval: NodeJS.Timeout | null = null;
let initializationPromise: Promise<void> | null = null;
const logger = createLogger("SANDBOX_LIFECYCLE");

function startCleanupInterval(): NodeJS.Timeout {
  let cleanupInProgress = false;

  const timer = setInterval(() => {
    if (cleanupInProgress) {
      logger.warn(
        "Skipping sandbox cleanup tick because previous cleanup is still running",
      );
      return;
    }

    cleanupInProgress = true;
    void cleanupExpiredSandboxContainers()
      .catch((error: unknown) => {
        logger.error(
          { error: ensureError(error) },
          "Sandbox cleanup interval failed",
        );
      })
      .finally(() => {
        cleanupInProgress = false;
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

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    if (cleanupInterval) {
      return;
    }

    if (!(await isSandboxRuntimeAvailable())) {
      throw new Error(
        "Sandbox service is enabled but Docker runtime is unavailable.",
      );
    }

    await cleanupExpiredSandboxContainers();

    if (!cleanupInterval) {
      cleanupInterval = startCleanupInterval();
    }
  })();

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }

  initializationPromise = null;
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
