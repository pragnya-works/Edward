import { cleanupExpiredSandboxContainers } from "./cleanup.js";
import { CLEANUP_INTERVAL_MS } from "./state.js";
import { pingDocker } from "../sandbox-runtime.service.js";
import { createLogger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";
import { config } from "../../../app.config.js";

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

export async function isSandboxRuntimeAvailable(): Promise<boolean> {
  if (config.sandbox.runtime === "disabled") {
    return false;
  }
  return pingDocker();
}

export async function initSandboxService(): Promise<void> {
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

    if (config.sandbox.runtime === "disabled") {
      return;
    }

    const runtimeAvailable = await isSandboxRuntimeAvailable();
    if (!runtimeAvailable) {
      if (!config.sandbox.required) {
        logger.warn(
          {
            runtime: config.sandbox.runtime,
            required: config.sandbox.required,
          },
          "Sandbox runtime unavailable during startup; continuing in degraded mode",
        );
      } else {
        logger.error(
          {
            runtime: config.sandbox.runtime,
            required: config.sandbox.required,
          },
          "Sandbox runtime unavailable during startup; API will continue booting and retry in the background",
        );
      }

      if (!cleanupInterval) {
        cleanupInterval = startCleanupInterval();
      }
      return;
    }

    try {
      await cleanupExpiredSandboxContainers();
    } catch (error) {
      logger.error(
        { error: ensureError(error) },
        "Initial sandbox cleanup failed; continuing startup",
      );
    }

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
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
