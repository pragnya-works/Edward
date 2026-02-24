import { nanoid } from "nanoid";
import { redis } from "./redis.js";

const RELEASE_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export interface LockHandle {
  key: string;
  id: string;
}

export interface AcquireLockOptions {
  /** TTL in milliseconds */
  ttlMs: number;
  /** Whether to retry on failure (up to 20 retries, 250ms apart) */
  retry?: boolean;
}

/**
 * Acquire a distributed lock using Redis SET NX PX with a unique owner ID.
 * Returns a LockHandle on success, or null if the lock could not be acquired.
 */
export async function acquireDistributedLock(
  key: string,
  options: AcquireLockOptions,
): Promise<LockHandle | null> {
  const lockId = nanoid();
  const { ttlMs, retry = false } = options;

  const acquired = await redis.set(key, lockId, "PX", ttlMs, "NX");
  if (acquired) return { key, id: lockId };
  if (!retry) return null;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const retryResult = await redis.set(key, lockId, "PX", ttlMs, "NX");
    if (retryResult) return { key, id: lockId };
  }

  return null;
}

/**
 * Safely release a distributed lock using a Lua CAS (compare-and-swap) script.
 * Only deletes the key if the current value matches the lock owner's ID.
 */
export async function releaseDistributedLock(
  handle: LockHandle,
): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, handle.key, handle.id);
}
