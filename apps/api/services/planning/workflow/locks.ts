import {
  acquireDistributedLock,
  releaseDistributedLock,
  type LockHandle,
} from "../../../lib/distributedLock.js";

const LOCK_PREFIX = "edward:lock:";
const LOCK_TTL_MS = 300_000;

const activeLocks = new Map<string, LockHandle>();

export async function acquireLock(lockKey: string): Promise<string | null> {
  const handle = await acquireDistributedLock(`${LOCK_PREFIX}${lockKey}`, {
    ttlMs: LOCK_TTL_MS,
  });
  if (!handle) return null;
  activeLocks.set(handle.key, handle);
  return handle.id;
}

export async function releaseLock(
  lockKey: string,
  lockId: string,
): Promise<void> {
  const fullKey = `${LOCK_PREFIX}${lockKey}`;
  const handle = activeLocks.get(fullKey);
  if (handle && handle.id === lockId) {
    activeLocks.delete(fullKey);
    await releaseDistributedLock(handle);
  } else {
    await releaseDistributedLock({ key: fullKey, id: lockId });
  }
}
