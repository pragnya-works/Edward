import { redis } from "../../../lib/redis.js";
import { logger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";
import { flushSandbox } from "./flush.js";
import { FLUSH_DUE_PREFIX, WRITE_DEBOUNCE_MS } from "./shared.js";
const FLUSH_MARKER_TTL_MS = 30 * 60 * 1000;
const SCHEDULER_LOCK_TTL_MS = 5_000;
const SCAN_COUNT = 200;

function dueKey(sandboxId: string): string {
  return `${FLUSH_DUE_PREFIX}${sandboxId}`;
}

function lockKey(sandboxId: string): string {
  return `${FLUSH_DUE_PREFIX}${sandboxId}:lock`;
}

export async function clearScheduledFlush(sandboxId: string): Promise<void> {
  await redis.del(dueKey(sandboxId)).catch(() => {});
}

export function scheduleSandboxFlush(
  sandboxId: string,
  immediate: boolean,
): void {
  const dueAt = immediate ? Date.now() : Date.now() + WRITE_DEBOUNCE_MS;
  void redis
    .set(dueKey(sandboxId), String(dueAt), "PX", FLUSH_MARKER_TTL_MS)
    .catch((error) => {
      logger.warn(
        { error: ensureError(error), sandboxId },
        "Failed to persist scheduled flush marker",
      );
    });

  if (!immediate) {
    return;
  }

  void flushSandbox(sandboxId).catch((error: unknown) =>
    logger.error(
      ensureError(error),
      `Immediate flush failed for sandbox: ${sandboxId}`,
    ),
  );
}

async function scanDueKeys(): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await redis.scan(
      cursor,
      "MATCH",
      `${FLUSH_DUE_PREFIX}*`,
      "COUNT",
      SCAN_COUNT,
    );

    cursor = nextCursor;
    for (const key of batch) {
      if (!key.endsWith(":lock")) {
        keys.push(key);
      }
    }
  } while (cursor !== "0");

  return keys;
}

async function processDueMarker(key: string, now: number): Promise<void> {
  const sandboxId = key.slice(FLUSH_DUE_PREFIX.length);
  if (!sandboxId) {
    return;
  }

  const rawDueAt = await redis.get(key);
  if (!rawDueAt) {
    return;
  }

  const dueAt = Number.parseInt(rawDueAt, 10);
  if (!Number.isFinite(dueAt) || dueAt > now) {
    return;
  }

  const lock = await redis.set(lockKey(sandboxId), "1", "PX", SCHEDULER_LOCK_TTL_MS, "NX");
  if (!lock) {
    return;
  }

  try {
    const deleted = await redis.del(key);
    if (deleted === 0) {
      return;
    }

    await flushSandbox(sandboxId);
  } catch (error) {
    logger.error(
      { error: ensureError(error), sandboxId },
      "Scheduled sandbox flush failed",
    );
    // Re-schedule soon so flush work is retried by the worker loop.
    await redis
      .set(key, String(Date.now() + WRITE_DEBOUNCE_MS), "PX", FLUSH_MARKER_TTL_MS)
      .catch(() => {});
  } finally {
    await redis.del(lockKey(sandboxId)).catch(() => {});
  }
}

export async function processScheduledFlushes(): Promise<void> {
  const now = Date.now();
  const keys = await scanDueKeys();

  for (const key of keys) {
    await processDueMarker(key, now);
  }
}
