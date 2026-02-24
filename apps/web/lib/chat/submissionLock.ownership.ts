import {
  clearPersistedLockIfOwned,
  emitChange,
  submissionLockRuntime,
  type OwnedChatSubmissionLock,
} from "@/lib/chat/submissionLock.shared";

export function getOwnedLock(
  token: string,
  now: number = Date.now(),
): OwnedChatSubmissionLock | null {
  const owned = submissionLockRuntime.ownedLockByToken.get(token);
  if (!owned) {
    return null;
  }

  if (owned.expiresAtMs > now) {
    return owned;
  }

  releaseOwnedLock(token, { emit: false, clearStorage: true });
  return null;
}

export function releaseOwnedLock(
  token: string,
  options: { emit?: boolean; clearStorage?: boolean } = {},
): void {
  const owned = submissionLockRuntime.ownedLockByToken.get(token);
  if (!owned) {
    return;
  }

  const stopHeartbeat = submissionLockRuntime.heartbeatByToken.get(token);
  if (typeof stopHeartbeat === "number") {
    window.clearInterval(stopHeartbeat);
    submissionLockRuntime.heartbeatByToken.delete(token);
  }

  if (owned.mode === "web") {
    const release = submissionLockRuntime.webLockReleaseByToken.get(token);
    if (release) {
      submissionLockRuntime.webLockReleaseByToken.delete(token);
      release();
    }
  }

  submissionLockRuntime.ownedLockByToken.delete(token);

  if (options.clearStorage !== false) {
    clearPersistedLockIfOwned(owned.ownerId, token);
  }

  if (options.emit !== false) {
    emitChange();
  }
}

export function releaseAllOwnedLocks(): void {
  for (const token of Array.from(submissionLockRuntime.ownedLockByToken.keys())) {
    releaseOwnedLock(token, { emit: false, clearStorage: true });
  }
  emitChange();
}
