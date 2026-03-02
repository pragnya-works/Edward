"use client";

const STOP_INTENT_PREFIX = "edward:run-stop-intent:";
const STOP_INTENT_TTL_MS = 2 * 60 * 1000;
const STOP_INTENT_MIN_ATTEMPT_INTERVAL_MS = 1_500;
const STOP_NOTICE_PREFIX = "edward:run-stop-notice:";
const STOP_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

interface RunStopIntentState {
  expiresAt: number;
  lastAttemptAt: number;
}

interface RunStopNoticeState {
  expiresAt: number;
  userMessageId?: string;
}

function reportRunStopIntentError(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.error(`[runStopIntent] ${context}`, error);
}

function storageKey(chatId: string): string {
  return `${STOP_INTENT_PREFIX}${chatId}`;
}

function stopNoticeStorageKey(chatId: string): string {
  return `${STOP_NOTICE_PREFIX}${chatId}`;
}

function now(): number {
  return Date.now();
}

function readRunStopIntentState(chatId: string): RunStopIntentState | null {
  if (typeof window === "undefined" || !chatId) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey(chatId));
    if (!raw) {
      return null;
    }

    // Backwards-compatible with legacy numeric expiry payloads.
    const numericExpiry = Number.parseInt(raw, 10);
    if (Number.isFinite(numericExpiry) && numericExpiry > 0) {
      return {
        expiresAt: numericExpiry,
        lastAttemptAt: 0,
      };
    }

    const parsed = JSON.parse(raw) as Partial<RunStopIntentState>;
    const expiresAt =
      typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : Number.NaN;
    const lastAttemptAt =
      typeof parsed.lastAttemptAt === "number" &&
      Number.isFinite(parsed.lastAttemptAt) &&
      parsed.lastAttemptAt >= 0
        ? parsed.lastAttemptAt
        : 0;

    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      window.sessionStorage.removeItem(storageKey(chatId));
      return null;
    }

    return {
      expiresAt,
      lastAttemptAt,
    };
  } catch (error) {
    reportRunStopIntentError("failed to read stop intent state", error);
    return null;
  }
}

function writeRunStopIntentState(chatId: string, state: RunStopIntentState): void {
  if (typeof window === "undefined" || !chatId) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey(chatId), JSON.stringify(state));
  } catch (error) {
    reportRunStopIntentError("failed to write stop intent state", error);
  }
}

function readRunStopNoticeState(chatId: string): RunStopNoticeState | null {
  if (typeof window === "undefined" || !chatId) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(stopNoticeStorageKey(chatId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RunStopNoticeState>;
    const expiresAt =
      typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : Number.NaN;
    const userMessageId =
      typeof parsed.userMessageId === "string" && parsed.userMessageId.length > 0
        ? parsed.userMessageId
        : undefined;

    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      window.sessionStorage.removeItem(stopNoticeStorageKey(chatId));
      return null;
    }

    return {
      expiresAt,
      userMessageId,
    };
  } catch (error) {
    reportRunStopIntentError("failed to read stop notice state", error);
    return null;
  }
}

function writeRunStopNoticeState(chatId: string, state: RunStopNoticeState): void {
  if (typeof window === "undefined" || !chatId) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      stopNoticeStorageKey(chatId),
      JSON.stringify(state),
    );
  } catch (error) {
    reportRunStopIntentError("failed to write stop notice state", error);
  }
}

export function markRunStopIntent(chatId: string): void {
  if (typeof window === "undefined" || !chatId) {
    return;
  }

  writeRunStopIntentState(chatId, {
    expiresAt: now() + STOP_INTENT_TTL_MS,
    lastAttemptAt: 0,
  });
}

export function hasRunStopIntent(chatId: string): boolean {
  if (!chatId) {
    return false;
  }

  const state = readRunStopIntentState(chatId);
  if (!state) {
    return false;
  }

  if (state.expiresAt <= now()) {
    clearRunStopIntent(chatId);
    return false;
  }

  return true;
}

export function shouldAttemptRunStopIntent(chatId: string): boolean {
  if (!chatId) {
    return false;
  }

  const state = readRunStopIntentState(chatId);
  if (!state) {
    return false;
  }

  const currentTime = now();
  if (state.expiresAt <= currentTime) {
    clearRunStopIntent(chatId);
    return false;
  }

  return currentTime - state.lastAttemptAt >= STOP_INTENT_MIN_ATTEMPT_INTERVAL_MS;
}

export function markRunStopIntentAttempt(chatId: string): void {
  if (!chatId) {
    return;
  }

  const state = readRunStopIntentState(chatId);
  if (!state) {
    return;
  }

  writeRunStopIntentState(chatId, {
    expiresAt: state.expiresAt,
    lastAttemptAt: now(),
  });
}

export function clearRunStopIntent(chatId: string): void {
  if (typeof window === "undefined" || !chatId) {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey(chatId));
  } catch (error) {
    reportRunStopIntentError("failed to clear stop intent state", error);
  }
}

export function markRunStopNotice(chatId: string, userMessageId?: string): void {
  if (!chatId) {
    return;
  }

  writeRunStopNoticeState(chatId, {
    expiresAt: now() + STOP_NOTICE_TTL_MS,
    userMessageId,
  });
}

export function getRunStopNotice(
  chatId: string,
): { userMessageId?: string } | null {
  if (!chatId) {
    return null;
  }

  const state = readRunStopNoticeState(chatId);
  if (!state) {
    return null;
  }

  if (state.expiresAt <= now()) {
    clearRunStopNotice(chatId);
    return null;
  }

  return {
    userMessageId: state.userMessageId,
  };
}

export function hasRunStopNotice(chatId: string): boolean {
  return getRunStopNotice(chatId) !== null;
}

export function clearRunStopNotice(chatId: string): void {
  if (typeof window === "undefined" || !chatId) {
    return;
  }

  try {
    window.sessionStorage.removeItem(stopNoticeStorageKey(chatId));
  } catch (error) {
    reportRunStopIntentError("failed to clear stop notice state", error);
  }
}
