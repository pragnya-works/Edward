export const CHAT_SUBMISSION_TAB_ID_KEY = "edward:chat-submission-tab-id";
export const CHAT_SUBMISSION_WEB_LOCK_NAME = "edward:chat-submission-lock-v2";
export const CHAT_SUBMISSION_BROADCAST_CHANNEL = "edward:chat-submission-lock-sync";
export const CHAT_SUBMISSION_LOCK_TTL_MS = 2 * 60 * 1000;
export const CHAT_SUBMISSION_HEARTBEAT_MS = 10 * 1000;
export const STORAGE_LOCK_STABILIZATION_MS = 48;
export const CHAT_SUBMISSION_MAX_CONCURRENT = 2;

export interface StoredChatSubmissionLock {
  ownerId: string;
  token: string;
  expiresAtMs: number;
}

export type OwnedLockMode = "web" | "memory";

export interface OwnedChatSubmissionLock extends StoredChatSubmissionLock {
  mode: OwnedLockMode;
}

export interface ChatSubmissionLockSnapshot {
  isLocked: boolean;
  isOwnedByCurrentTab: boolean;
  expiresAt: Date | null;
  retryAfterMs: number;
}

type LockBroadcastMessage =
  | {
      type: "LOCK_UPSERT";
      lock: StoredChatSubmissionLock;
    }
  | {
      type: "LOCK_CLEAR";
      token: string;
    };

export const submissionLockRuntime = {
  listeners: new Set<() => void>(),
  heartbeatByToken: new Map<string, number>(),
  ownedLockByToken: new Map<string, OwnedChatSubmissionLock>(),
  webLockReleaseByToken: new Map<string, () => void>(),
  sharedLocksByToken: new Map<string, StoredChatSubmissionLock>(),
  lockSyncChannel: null as BroadcastChannel | null,
  cachedTabId: null as string | null,
  storageListenerAttached: false,
  lifecycleListenerAttached: false,
  pendingAcquireCount: 0,
};

export function safeRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function isWebLockSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const locks = navigator.locks as { request?: unknown } | undefined;
  return typeof locks?.request === "function";
}

export function getTabId(): string {
  if (submissionLockRuntime.cachedTabId) {
    return submissionLockRuntime.cachedTabId;
  }

  const generated = safeRandomId();
  if (typeof window === "undefined") {
    submissionLockRuntime.cachedTabId = generated;
    return generated;
  }

  try {
    const existing = window.sessionStorage.getItem(CHAT_SUBMISSION_TAB_ID_KEY);
    if (existing && existing.trim().length > 0) {
      submissionLockRuntime.cachedTabId = existing;
      return existing;
    }

    window.sessionStorage.setItem(CHAT_SUBMISSION_TAB_ID_KEY, generated);
  } catch {
    // no-op
  }

  submissionLockRuntime.cachedTabId = generated;
  return generated;
}

function isValidStoredChatSubmissionLock(
  value: Partial<StoredChatSubmissionLock> | null | undefined,
): value is StoredChatSubmissionLock {
  return Boolean(
    value &&
      typeof value.ownerId === "string" &&
      value.ownerId.trim().length > 0 &&
      typeof value.token === "string" &&
      value.token.trim().length > 0 &&
      typeof value.expiresAtMs === "number" &&
      Number.isFinite(value.expiresAtMs) &&
      value.expiresAtMs > 0,
  );
}

function ensureLockSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (submissionLockRuntime.lockSyncChannel) {
    return submissionLockRuntime.lockSyncChannel;
  }

  try {
    submissionLockRuntime.lockSyncChannel = new BroadcastChannel(
      CHAT_SUBMISSION_BROADCAST_CHANNEL,
    );
  } catch {
    submissionLockRuntime.lockSyncChannel = null;
  }

  return submissionLockRuntime.lockSyncChannel;
}

function postLockMessage(message: LockBroadcastMessage): void {
  const channel = ensureLockSyncChannel();
  if (!channel) {
    return;
  }

  try {
    channel.postMessage(message);
  } catch {
    // no-op
  }
}

export function applyLockMessage(message: unknown): void {
  if (!message || typeof message !== "object") {
    return;
  }

  const payload = message as Partial<LockBroadcastMessage>;
  if (payload.type === "LOCK_UPSERT") {
    if (!isValidStoredChatSubmissionLock(payload.lock)) {
      return;
    }
    submissionLockRuntime.sharedLocksByToken.set(
      payload.lock.token,
      payload.lock,
    );
    return;
  }

  if (payload.type === "LOCK_CLEAR") {
    if (typeof payload.token !== "string") {
      return;
    }

    submissionLockRuntime.sharedLocksByToken.delete(payload.token);
  }
}

function clearRawLock(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  submissionLockRuntime.sharedLocksByToken.delete(token);
  postLockMessage({
    type: "LOCK_CLEAR",
    token,
  });
}

export function writeRawLock(lock: StoredChatSubmissionLock): boolean {
  if (typeof window === "undefined" || !isValidStoredChatSubmissionLock(lock)) {
    return false;
  }

  submissionLockRuntime.sharedLocksByToken.set(lock.token, lock);
  postLockMessage({
    type: "LOCK_UPSERT",
    lock,
  });
  return true;
}

function clearRawLockLocally(ownerId: string, token: string): void {
  const current = submissionLockRuntime.sharedLocksByToken.get(token);
  if (!current || current.ownerId !== ownerId) {
    return;
  }

  clearRawLock(token);
}

export function emitChange(): void {
  for (const listener of submissionLockRuntime.listeners) {
    listener();
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeoutMs = Math.max(Math.trunc(ms), 0);
    window.setTimeout(resolve, timeoutMs);
  });
}

export function getActiveSharedLocks(
  now: number = Date.now(),
): StoredChatSubmissionLock[] {
  const activeLocks: StoredChatSubmissionLock[] = [];
  const expiredTokens: string[] = [];

  for (const [token, lock] of submissionLockRuntime.sharedLocksByToken) {
    if (lock.expiresAtMs > now) {
      activeLocks.push(lock);
      continue;
    }
    expiredTokens.push(token);
  }

  if (expiredTokens.length > 0) {
    for (const token of expiredTokens) {
      clearRawLock(token);
    }
  }

  return activeLocks;
}

export function clearPersistedLockIfOwned(ownerId: string, token: string): void {
  clearRawLockLocally(ownerId, token);
}

export function subscribeToLockBroadcasts(listener: () => void): void {
  const channel = ensureLockSyncChannel();
  if (!channel) {
    return;
  }

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    applyLockMessage(event.data);
    listener();
  });
}
