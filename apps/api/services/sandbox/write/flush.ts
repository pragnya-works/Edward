import path from "path";
import { redis } from "../../../lib/redis.js";
import { releaseDistributedLock } from "../../../lib/distributedLock.js";
import { logger } from "../../../utils/logger.js";
import { getSandboxState } from "../state.service.js";
import {
  getContainer,
  ensureContainerRunning,
  CONTAINER_WORKDIR,
  appendFileContent,
} from "../docker.service.js";
import { acquireDistributedLock } from "../../../lib/distributedLock.js";
import {
  BUFFER_FILES_SET_PREFIX,
  BUFFER_KEY_PREFIX,
  FLUSH_LOCK_PREFIX,
  FLUSH_LOCK_TTL,
  MAX_FLUSH_FAILURES,
} from "./shared.js";

export async function flushSandbox(
  sandboxId: string,
  waitForLock = false,
): Promise<void> {
  const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
  const handle = await acquireDistributedLock(lockKey, {
    ttlMs: FLUSH_LOCK_TTL,
    retry: waitForLock,
  });

  if (!handle) {
    if (waitForLock) {
      logger.error({ sandboxId }, "Failed to acquire flush lock after retries");
    }
    return;
  }

  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;

    const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
    const container = getContainer(sandbox.containerId);
    await ensureContainerRunning(container);

    let failureCount = 0;
    while (failureCount < MAX_FLUSH_FAILURES) {
      const filePaths = await redis.smembers(filesSetKey);
      if (filePaths.length === 0) break;

      let batchFailed = false;
      for (const filePath of filePaths) {
        const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${filePath}`;
        const processingKey = `${bufferKey}:processing`;

        try {
          await redis.rename(bufferKey, processingKey);
          await redis.srem(filesSetKey, filePath);
        } catch (err) {
          logger.debug(
            { err, sandboxId, filePath },
            "Redis rename failed during flush, skipping",
          );
          batchFailed = true;
          continue;
        }

        const content = await redis.get(processingKey);
        if (content === null) {
          await redis.del(processingKey);
          continue;
        }

        try {
          const fullPath = path.posix.join(CONTAINER_WORKDIR, filePath);
          await appendFileContent(container, fullPath, content);
        } finally {
          await redis.del(processingKey);
        }
      }

      if (batchFailed) {
        failureCount++;
        if (failureCount >= MAX_FLUSH_FAILURES) {
          logger.error(
            { sandboxId, failureCount },
            "Flush failed too many times, giving up",
          );
          throw new Error("Flush failed after maximum retries");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    logger.error({ error, sandboxId }, "Flush failed");
    throw error;
  } finally {
    await releaseDistributedLock(handle);
  }
}
