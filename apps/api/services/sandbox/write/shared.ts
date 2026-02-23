import path from "path";
import { redis } from "../../../lib/redis.js";
import { getTemplateConfig } from "../templates/template.registry.js";

export const BUFFER_KEY_PREFIX = "edward:buffer:";
export const BUFFER_FILES_SET_PREFIX = "edward:buffer:files:";
export const FLUSH_LOCK_PREFIX = "edward:flush:lock:";
export const FLUSH_DUE_PREFIX = "edward:flush:due:";

export const WRITE_DEBOUNCE_MS = 100;
export const MAX_WRITE_BUFFER = 5 * 1024 * 1024;
export const FLUSH_LOCK_TTL = 30_000;
export const MAX_FLUSH_FAILURES = 10;

export function isProtectedFile(filePath: string, framework?: string): boolean {
  if (!framework) return false;

  const config = getTemplateConfig(framework);
  if (!config) return false;

  const fileName = path.posix.basename(filePath);
  return (
    config.protectedFiles.includes(fileName) ||
    config.protectedFiles.includes(filePath)
  );
}

export async function cleanupBufferKeys(
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

  if (!results) return;
  for (const [err] of results) {
    if (err) {
      throw err;
    }
  }
}

export async function acquireLock(
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
