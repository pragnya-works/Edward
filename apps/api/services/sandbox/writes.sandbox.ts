import path from "path";
import { redis } from "../../lib/redis.js";
import { getSandboxState } from "./state.sandbox.js";
import {
  getContainer,
  ensureContainerRunning,
  CONTAINER_WORKDIR,
  execCommand,
} from "./docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import { getTemplateConfig } from "./templates/template.registry.js";

function isProtectedFile(filePath: string, framework?: string): boolean {
  if (!framework) return false;

  const config = getTemplateConfig(framework);
  if (!config) return false;

  const fileName = path.posix.basename(filePath);
  return (
    config.protectedFiles.includes(fileName) ||
    config.protectedFiles.includes(filePath)
  );
}

const BUFFER_KEY_PREFIX = "edward:buffer:";
const BUFFER_FILES_SET_PREFIX = "edward:buffer:files:";
const FLUSH_LOCK_PREFIX = "edward:flush:lock:";

const WRITE_DEBOUNCE_MS = 100;
const MAX_WRITE_BUFFER = 5 * 1024 * 1024;
const FLUSH_LOCK_TTL = 30000;
const MAX_FLUSH_FAILURES = 10;

const writeTimers = new Map<string, NodeJS.Timeout>();

async function cleanupBufferKeys(
  sandboxId: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) return;

  const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
  const bufferKeys = filePaths.map(
    (filePath) => `${BUFFER_KEY_PREFIX}${sandboxId}:${filePath}`,
  );

  const pipeline = redis.pipeline();
  bufferKeys.forEach((key) => pipeline.del(key));
  filePaths.forEach((filePath) => pipeline.srem(filesSetKey, filePath));
  const results = await pipeline.exec();
  if (results) {
    for (const [err] of results) {
      if (err) {
        throw err;
      }
    }
  }
}

async function acquireLock(
  key: string,
  ttl: number,
  retry = false,
): Promise<boolean> {
  const lock = await redis.set(key, "locked", "PX", ttl, "NX");
  if (lock) return true;
  if (!retry) return false;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const retryLock = await redis.set(key, "locked", "PX", ttl, "NX");
    if (retryLock) return true;
  }
  return false;
}

export async function flushSandbox(
  sandboxId: string,
  waitForLock = false,
): Promise<void> {
  const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
  const acquired = await acquireLock(lockKey, FLUSH_LOCK_TTL, waitForLock);

  if (!acquired) {
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
        if (!content) {
          await redis.del(processingKey);
          continue;
        }

        try {
          const fullPath = path.posix.join(CONTAINER_WORKDIR, filePath);
          const exec = await container.exec({
            Cmd: ["sh", "-c", `cat >> '${fullPath.replace(/'/g, "'\"'\"'")}'`],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
          });

          const stream = await exec.start({ hijack: true });

          await new Promise<void>((resolve, reject) => {
            stream.on("end", resolve);
            stream.on("error", reject);
            stream.write(content);
            stream.end();
          });

          const { ExitCode } = await exec.inspect();
          if (ExitCode !== 0 && ExitCode !== null) {
            logger.error(
              { sandboxId, filePath, ExitCode },
              "Cat command failed during flush",
            );
          }
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
    await redis.del(lockKey);
  }
}

export async function writeSandboxFile(
  sandboxId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return;

  const normalizedPath = path.posix.normalize(filePath);
  if (
    normalizedPath.startsWith("..") ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  if (isProtectedFile(normalizedPath, sandbox.scaffoldedFramework)) {
    logger.info(
      {
        sandboxId,
        filePath: normalizedPath,
        framework: sandbox.scaffoldedFramework,
      },
      "Blocked write to protected framework file",
    );
    return;
  }

  const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${normalizedPath}`;
  const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.append(bufferKey, content);
    pipeline.sadd(filesSetKey, normalizedPath);
    pipeline.pexpire(bufferKey, 30 * 60 * 1000);
    pipeline.pexpire(filesSetKey, 30 * 60 * 1000);
    const results = await pipeline.exec();
    if (results) {
      for (const [err] of results) {
        if (err) {
          throw err;
        }
      }
    }
  } catch (error) {
    logger.error(
      { error, sandboxId, filePath: normalizedPath },
      "Redis write failed",
    );
    throw new Error(
      `Failed to buffer file content: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const currentBufferSize = await redis.strlen(bufferKey);

  const timer = writeTimers.get(sandboxId);
  if (timer) clearTimeout(timer);

  if (currentBufferSize > MAX_WRITE_BUFFER) {
    writeTimers.delete(sandboxId);
    void flushSandbox(sandboxId);
    return;
  }

  writeTimers.set(
    sandboxId,
    setTimeout(() => {
      writeTimers.delete(sandboxId);
      void flushSandbox(sandboxId);
    }, WRITE_DEBOUNCE_MS),
  );
}

export async function prepareSandboxFile(
  sandboxId: string,
  filePath: string,
): Promise<void> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  const normalizedPath = path.posix.normalize(filePath);
  if (
    normalizedPath.startsWith("..") ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  if (isProtectedFile(normalizedPath, sandbox.scaffoldedFramework)) {
    logger.info(
      {
        sandboxId,
        filePath: normalizedPath,
        framework: sandbox.scaffoldedFramework,
      },
      "Blocked prepare/truncate for protected framework file",
    );
    return;
  }

  const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
  const acquired = await acquireLock(lockKey, FLUSH_LOCK_TTL, true);
  if (!acquired) {
    throw new Error(`Failed to acquire lock to prepare file: ${filePath}`);
  }

  try {
    await cleanupBufferKeys(sandboxId, [normalizedPath]);

    const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
    const dirPath = path.posix.dirname(fullPath);

    const container = getContainer(sandbox.containerId);
    await execCommand(container, ["mkdir", "-p", dirPath]);
    await execCommand(container, ["truncate", "-s", "0", fullPath]);
  } finally {
    await redis.del(lockKey);
  }
}

export function clearWriteTimers(sandboxId: string): void {
  const timer = writeTimers.get(sandboxId);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(sandboxId);
  }
}

export async function clearBuffers(sandboxId: string): Promise<void> {
  const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
  const filePaths = await redis.smembers(filesSetKey);
  await cleanupBufferKeys(sandboxId, filePaths);
  await redis.del(filesSetKey);
}
