import {
  isKnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";
import type { PersistedRateLimitState } from "./state.types";
import {
  RATE_LIMIT_STORAGE_KEY,
  cooldownByScope,
  emitChange,
  isValidResetAtMs,
  quotaByScope,
  stateRuntime,
} from "./state.shared";

function normalizeStorageOwner(owner: string | null): string | null {
  if (!owner) {
    return null;
  }

  const normalized = owner.trim();
  return normalized.length > 0 ? normalized : null;
}

function getRateLimitStorageKey(): string | null {
  if (!stateRuntime.storageOwner) {
    return null;
  }
  return `${RATE_LIMIT_STORAGE_KEY}:${stateRuntime.storageOwner}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function handleRateLimitStateError(
  error: unknown,
  metadata: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[rateLimit state] storage operation failed", {
    ...metadata,
    error,
  });
}

export function persistRateLimitState(now: number = Date.now()): void {
  if (!canUseLocalStorage()) {
    return;
  }

  const storageKey = getRateLimitStorageKey();
  if (!storageKey) {
    return;
  }

  const payload: PersistedRateLimitState = {
    cooldowns: [],
    quotas: [],
  };

  for (const [scope, resetAtMs] of cooldownByScope) {
    if (resetAtMs > now) {
      payload.cooldowns.push({ scope, resetAtMs });
    }
  }

  for (const [scope, quota] of quotaByScope) {
    if (quota.resetAtMs > now) {
      payload.quotas.push({
        scope,
        limit: quota.limit,
        remaining: quota.remaining,
        resetAtMs: quota.resetAtMs,
      });
    }
  }

  try {
    if (payload.cooldowns.length === 0 && payload.quotas.length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (error: unknown) {
    handleRateLimitStateError(error, {
      context: "persistRateLimitState",
      storageKey,
      payload,
    });
  }
}

export function hydratePersistedRateLimitState(now: number = Date.now()): void {
  if (stateRuntime.persistedStateHydrated || !canUseLocalStorage()) {
    return;
  }

  const storageKey = getRateLimitStorageKey();
  if (!storageKey) {
    return;
  }

  stateRuntime.persistedStateHydrated = true;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (error: unknown) {
    handleRateLimitStateError(error, {
      context: "hydratePersistedRateLimitState:getItem",
      storageKey,
    });
    return;
  }

  if (!raw) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    handleRateLimitStateError(error, {
      context: "hydratePersistedRateLimitState:parse",
      storageKey,
      raw,
    });
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  const payload = parsed as Partial<PersistedRateLimitState>;
  const cooldowns = Array.isArray(payload.cooldowns) ? payload.cooldowns : [];
  const quotas = Array.isArray(payload.quotas) ? payload.quotas : [];

  for (const cooldown of cooldowns) {
    if (!cooldown || typeof cooldown !== "object") {
      continue;
    }

    const scope = (cooldown as { scope?: unknown }).scope as RateLimitScope;
    const resetAtMs = (cooldown as { resetAtMs?: unknown }).resetAtMs;
    if (!isKnownRateLimitScope(scope) || !isValidResetAtMs(resetAtMs) || resetAtMs <= now) {
      continue;
    }

    const existing = cooldownByScope.get(scope);
    if (!existing || existing < resetAtMs) {
      cooldownByScope.set(scope, resetAtMs);
    }
  }

  for (const quota of quotas) {
    if (!quota || typeof quota !== "object") {
      continue;
    }

    const scope = (quota as { scope?: unknown }).scope as RateLimitScope;
    const limit = (quota as { limit?: unknown }).limit;
    const remaining = (quota as { remaining?: unknown }).remaining;
    const resetAtMs = (quota as { resetAtMs?: unknown }).resetAtMs;
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(Number(limit)) : NaN;
    if (
      !isKnownRateLimitScope(scope) ||
      !Number.isFinite(normalizedLimit) ||
      normalizedLimit <= 0 ||
      !Number.isFinite(remaining) ||
      !isValidResetAtMs(resetAtMs) ||
      resetAtMs <= now
    ) {
      continue;
    }

    const normalizedRemaining = Math.min(
      Math.max(Math.trunc(Number(remaining)), 0),
      normalizedLimit,
    );
    const existing = quotaByScope.get(scope);
    if (!existing || existing.resetAtMs < resetAtMs) {
      quotaByScope.set(scope, {
        limit: normalizedLimit,
        remaining: normalizedRemaining,
        resetAtMs,
      });
    }
  }

  persistRateLimitState(now);
}

export function ensureRateLimitStateHydrated(now: number = Date.now()): void {
  hydratePersistedRateLimitState(now);
}

export function syncRateLimitStorageOwner(owner: string | null): void {
  const nextOwner = normalizeStorageOwner(owner);
  if (stateRuntime.storageOwner === nextOwner) {
    return;
  }

  stateRuntime.storageOwner = nextOwner;
  stateRuntime.persistedStateHydrated = false;
  cooldownByScope.clear();
  quotaByScope.clear();
  hydratePersistedRateLimitState();
  emitChange();
}
