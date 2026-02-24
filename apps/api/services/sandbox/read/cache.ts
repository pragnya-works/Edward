import { redis } from "../../../lib/redis.js";

const SNAPSHOT_CACHE_TTL_MS = 30_000;
const SNAPSHOT_CACHE_KEY_PREFIX = "edward:snapshot-cache:";

interface SnapshotCachePayload {
  files: Array<[string, string]>;
}

function snapshotCacheEnabled(): boolean {
  return process.env.NODE_ENV !== "test";
}

function snapshotCacheKey(cacheKey: string): string {
  return `${SNAPSHOT_CACHE_KEY_PREFIX}${cacheKey}`;
}

export async function getSnapshotCacheEntry(
  cacheKey: string,
): Promise<{ expiresAt: number; files: Map<string, string> } | null> {
  if (!snapshotCacheEnabled()) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = await redis.get(snapshotCacheKey(cacheKey));
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SnapshotCachePayload>;
    if (!Array.isArray(parsed.files)) {
      await redis.del(snapshotCacheKey(cacheKey));
      return null;
    }

    return {
      expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
      files: new Map(parsed.files),
    };
  } catch {
    await redis.del(snapshotCacheKey(cacheKey));
    return null;
  }
}

export async function setSnapshotCacheEntry(
  cacheKey: string,
  files: Map<string, string>,
): Promise<void> {
  if (!snapshotCacheEnabled()) {
    return;
  }

  const payload: SnapshotCachePayload = {
    files: Array.from(files.entries()),
  };
  await redis
    .set(
      snapshotCacheKey(cacheKey),
      JSON.stringify(payload),
      "PX",
      SNAPSHOT_CACHE_TTL_MS,
    )
    .catch(() => {});
}

export function cacheKeyForSnapshot(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}
