import {
  CHAT_SUBMISSION_MAX_CONCURRENT,
  CHAT_SUBMISSION_HEARTBEAT_MS,
  CHAT_SUBMISSION_LOCK_TTL_MS,
  clearPersistedLockIfOwned,
  emitChange,
  getActiveSharedLocks,
  getTabId,
  submissionLockRuntime,
  writeRawLock,
  type ChatSubmissionLockSnapshot,
  type StoredChatSubmissionLock,
} from "@/lib/chat/submissionLock.shared";
import {
  getOwnedLock,
  releaseOwnedLock,
} from "@/lib/chat/submissionLock.ownership";
import {
  ensureLifecycleListener,
  ensureStorageListener,
} from "@/lib/chat/submissionLock.lifecycle";
import { acquireChatSubmissionLock } from "@/lib/chat/submissionLock.acquire";

export { acquireChatSubmissionLock };
export type { ChatSubmissionLockSnapshot };

export function renewChatSubmissionLock(token: string): boolean {
  const now = Date.now();
  const owned = getOwnedLock(token, now);
  if (!owned) {
    return false;
  }

  const refreshed: StoredChatSubmissionLock = {
    ownerId: owned.ownerId,
    token: owned.token,
    expiresAtMs: now + CHAT_SUBMISSION_LOCK_TTL_MS,
  };

  writeRawLock(refreshed);
  submissionLockRuntime.ownedLockByToken.set(token, {
    ...refreshed,
    mode: owned.mode,
  });
  emitChange();
  return true;
}

export function releaseChatSubmissionLock(token: string): void {
  const owned = submissionLockRuntime.ownedLockByToken.get(token);
  if (owned) {
    releaseOwnedLock(token, { emit: true, clearStorage: true });
    return;
  }

  clearPersistedLockIfOwned(getTabId(), token);
  emitChange();
}

export function startChatSubmissionLockHeartbeat(
  token: string,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  ensureLifecycleListener();

  const existingHeartbeat = submissionLockRuntime.heartbeatByToken.get(token);
  if (typeof existingHeartbeat === "number") {
    window.clearInterval(existingHeartbeat);
    submissionLockRuntime.heartbeatByToken.delete(token);
  }

  const intervalId = window.setInterval(() => {
    const renewed = renewChatSubmissionLock(token);
    if (!renewed) {
      window.clearInterval(intervalId);
      submissionLockRuntime.heartbeatByToken.delete(token);
    }
  }, CHAT_SUBMISSION_HEARTBEAT_MS);

  submissionLockRuntime.heartbeatByToken.set(token, intervalId);

  return () => {
    const storedInterval = submissionLockRuntime.heartbeatByToken.get(token);
    if (typeof storedInterval === "number") {
      window.clearInterval(storedInterval);
      submissionLockRuntime.heartbeatByToken.delete(token);
    }
  };
}

export function getChatSubmissionLockSnapshot(
  now: number = Date.now(),
): ChatSubmissionLockSnapshot {
  const activeLocks = getActiveSharedLocks(now);
  if (activeLocks.length === 0) {
    return {
      isLocked: false,
      isOwnedByCurrentTab: false,
      expiresAt: null,
      retryAfterMs: 0,
    };
  }

  const isCapacityReached =
    activeLocks.length >= CHAT_SUBMISSION_MAX_CONCURRENT;
  if (!isCapacityReached) {
    return {
      isLocked: false,
      isOwnedByCurrentTab: activeLocks.some(
        (lock) => lock.ownerId === getTabId(),
      ),
      expiresAt: null,
      retryAfterMs: 0,
    };
  }

  let nextReleaseAtMs = activeLocks[0]?.expiresAtMs ?? now;
  for (const lock of activeLocks) {
    if (lock.expiresAtMs < nextReleaseAtMs) {
      nextReleaseAtMs = lock.expiresAtMs;
    }
  }

  const retryAfterMs = Math.max(nextReleaseAtMs - now, 0);
  return {
    isLocked: retryAfterMs > 0,
    isOwnedByCurrentTab: activeLocks.some((lock) => lock.ownerId === getTabId()),
    expiresAt: new Date(nextReleaseAtMs),
    retryAfterMs,
  };
}

export function subscribeChatSubmissionLock(listener: () => void): () => void {
  ensureStorageListener();
  ensureLifecycleListener();
  submissionLockRuntime.listeners.add(listener);

  return () => {
    submissionLockRuntime.listeners.delete(listener);
  };
}
