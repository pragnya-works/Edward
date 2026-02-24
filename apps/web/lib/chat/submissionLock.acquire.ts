import {
  CHAT_SUBMISSION_MAX_CONCURRENT,
  CHAT_SUBMISSION_LOCK_TTL_MS,
  CHAT_SUBMISSION_WEB_LOCK_NAME,
  STORAGE_LOCK_STABILIZATION_MS,
  clearPersistedLockIfOwned,
  emitChange,
  getActiveSharedLocks,
  getTabId,
  isWebLockSupported,
  safeRandomId,
  submissionLockRuntime,
  wait,
  writeRawLock,
  type OwnedChatSubmissionLock,
  type StoredChatSubmissionLock,
} from "@/lib/chat/submissionLock.shared";
import { ensureLifecycleListener } from "@/lib/chat/submissionLock.lifecycle";

async function acquireWithWebLock(ownerId: string): Promise<string | null> {
  if (!isWebLockSupported()) {
    return null;
  }

  for (let slot = 0; slot < CHAT_SUBMISSION_MAX_CONCURRENT; slot += 1) {
    const lockName = `${CHAT_SUBMISSION_WEB_LOCK_NAME}:${slot}`;
    const token = await new Promise<string | null>((resolve) => {
      let settled = false;
      const settle = (value: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      void navigator.locks
        .request(
          lockName,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              settle(null);
              return;
            }

            const nextToken = safeRandomId();
            const ownedLock: OwnedChatSubmissionLock = {
              ownerId,
              token: nextToken,
              expiresAtMs: Date.now() + CHAT_SUBMISSION_LOCK_TTL_MS,
              mode: "web",
            };

            const releaseGate = new Promise<void>((release) => {
              submissionLockRuntime.webLockReleaseByToken.set(nextToken, release);
            });

            submissionLockRuntime.ownedLockByToken.set(nextToken, ownedLock);
            writeRawLock(ownedLock);
            emitChange();
            settle(nextToken);

            try {
              await releaseGate;
            } finally {
              submissionLockRuntime.webLockReleaseByToken.delete(nextToken);
            }
          },
        )
        .catch(() => {
          settle(null);
        });
    });

    if (token) {
      return token;
    }
  }

  return null;
}

async function acquireWithStorageOrMemory(ownerId: string): Promise<string | null> {
  const now = Date.now();
  const activeLocks = getActiveSharedLocks(now);
  if (activeLocks.length >= CHAT_SUBMISSION_MAX_CONCURRENT) {
    return null;
  }

  const token = safeRandomId();
  const lock: StoredChatSubmissionLock = {
    ownerId,
    token,
    expiresAtMs: now + CHAT_SUBMISSION_LOCK_TTL_MS,
  };

  const persisted = writeRawLock(lock);
  if (!persisted) {
    submissionLockRuntime.ownedLockByToken.set(token, {
      ...lock,
      mode: "memory",
    });
    emitChange();
    return token;
  }

  await wait(STORAGE_LOCK_STABILIZATION_MS);
  const stabilizedLocks = getActiveSharedLocks(Date.now());
  const confirmed = stabilizedLocks.find(
    (entry) => entry.ownerId === ownerId && entry.token === token,
  );
  if (!confirmed) {
    return null;
  }

  const winningTokens = stabilizedLocks
    .slice()
    .sort((a, b) => a.token.localeCompare(b.token))
    .slice(0, CHAT_SUBMISSION_MAX_CONCURRENT)
    .map((entry) => entry.token);
  if (!winningTokens.includes(token)) {
    clearPersistedLockIfOwned(ownerId, token);
    emitChange();
    return null;
  }

  submissionLockRuntime.ownedLockByToken.set(token, {
    ...confirmed,
    mode: "memory",
  });
  emitChange();
  return token;
}

export async function acquireChatSubmissionLock(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const now = Date.now();
  const activeLockCount = getActiveSharedLocks(now).length;
  const pendingAcquireCount = submissionLockRuntime.pendingAcquireCount;
  if (activeLockCount >= CHAT_SUBMISSION_MAX_CONCURRENT) {
    return null;
  }
  if (activeLockCount + pendingAcquireCount >= CHAT_SUBMISSION_MAX_CONCURRENT) {
    return null;
  }

  submissionLockRuntime.pendingAcquireCount += 1;
  ensureLifecycleListener();

  try {
    const ownerId = getTabId();

    if (isWebLockSupported()) {
      return await acquireWithWebLock(ownerId);
    }

    return await acquireWithStorageOrMemory(ownerId);
  } finally {
    submissionLockRuntime.pendingAcquireCount = Math.max(
      submissionLockRuntime.pendingAcquireCount - 1,
      0,
    );
  }
}
