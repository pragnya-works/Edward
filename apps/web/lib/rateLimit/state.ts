import {
  isKnownRateLimitScope,
  type KnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";

const RATE_LIMIT_BROADCAST_CHANNEL = "edward:rate-limit-sync";
const RATE_LIMIT_STORAGE_KEY = "edward:rate-limit-state:v1";

const cooldownByScope = new Map<KnownRateLimitScope, number>();
const quotaByScope = new Map<
  KnownRateLimitScope,
  { limit: number; remaining: number; resetAtMs: number }
>();
const listeners = new Set<() => void>();
let syncListenerAttached = false;
let syncChannel: BroadcastChannel | null = null;
let persistedStateHydrated = false;
let storageOwner: string | null = null;

type RateLimitSyncMessage =
  | {
      type: "RATE_LIMIT_UPSERT";
      scope: KnownRateLimitScope;
      resetAtMs: number;
    }
  | {
      type: "RATE_LIMIT_CLEAR";
      scope: KnownRateLimitScope;
    };

export interface RateLimitCooldownSnapshot {
  scope: KnownRateLimitScope;
  resetAt: Date;
  retryAfterMs: number;
  remainingSeconds: number;
}

export interface RateLimitQuotaSnapshot {
  scope: KnownRateLimitScope;
  limit: number;
  remaining: number;
  used: number;
  usagePercent: number;
  resetAt: Date;
}

interface PersistedRateLimitState {
  cooldowns: Array<{ scope: KnownRateLimitScope; resetAtMs: number }>;
  quotas: Array<{
    scope: KnownRateLimitScope;
    limit: number;
    remaining: number;
    resetAtMs: number;
  }>;
}

function normalizeStorageOwner(owner: string | null): string | null {
  if (!owner) {
    return null;
  }

  const normalized = owner.trim();
  return normalized.length > 0 ? normalized : null;
}

function getRateLimitStorageKey(): string | null {
  if (!storageOwner) {
    return null;
  }
  return `${RATE_LIMIT_STORAGE_KEY}:${storageOwner}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function persistRateLimitState(now: number = Date.now()): void {
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
  } catch {
    // no-op
  }
}

function hydratePersistedRateLimitState(now: number = Date.now()): void {
  if (persistedStateHydrated || !canUseLocalStorage()) {
    return;
  }

  const storageKey = getRateLimitStorageKey();
  if (!storageKey) {
    return;
  }

  persistedStateHydrated = true;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return;
  }

  if (!raw) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
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
    if (
      !isKnownRateLimitScope(scope) ||
      !Number.isFinite(limit) ||
      Number(limit) <= 0 ||
      !Number.isFinite(remaining) ||
      !isValidResetAtMs(resetAtMs) ||
      resetAtMs <= now
    ) {
      continue;
    }

    const normalizedLimit = Math.trunc(Number(limit));
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

export function syncRateLimitStorageOwner(owner: string | null): void {
  const nextOwner = normalizeStorageOwner(owner);
  if (storageOwner === nextOwner) {
    return;
  }

  storageOwner = nextOwner;
  persistedStateHydrated = false;
  cooldownByScope.clear();
  quotaByScope.clear();
  hydratePersistedRateLimitState();
  emitChange();
}

function ensureSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (syncChannel) {
    return syncChannel;
  }

  try {
    syncChannel = new BroadcastChannel(RATE_LIMIT_BROADCAST_CHANNEL);
  } catch {
    syncChannel = null;
  }

  return syncChannel;
}

function isValidResetAtMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function broadcast(message: RateLimitSyncMessage): void {
  const channel = ensureSyncChannel();
  if (!channel) {
    return;
  }

  try {
    channel.postMessage(message);
  } catch {
    // no-op
  }
}

function applySyncMessage(message: unknown): void {
  hydratePersistedRateLimitState();

  if (!message || typeof message !== "object") {
    return;
  }

  const payload = message as Partial<RateLimitSyncMessage>;
  if (payload.type === "RATE_LIMIT_UPSERT") {
    const scope = payload.scope as RateLimitScope;
    if (!isKnownRateLimitScope(scope)) {
      return;
    }
    if (!isValidResetAtMs(payload.resetAtMs)) {
      return;
    }

    const current = cooldownByScope.get(scope);
    if (current === payload.resetAtMs) {
      return;
    }

    cooldownByScope.set(scope, payload.resetAtMs);
    persistRateLimitState();
    emitChange();
    return;
  }

  if (payload.type === "RATE_LIMIT_CLEAR") {
    const scope = payload.scope as RateLimitScope;
    if (!isKnownRateLimitScope(scope)) {
      return;
    }

    const changed = cooldownByScope.delete(scope);
    if (changed) {
      persistRateLimitState();
      emitChange();
    }
  }
}

function ensureSyncListener(): void {
  if (syncListenerAttached || typeof window === "undefined") {
    return;
  }

  const channel = ensureSyncChannel();
  if (!channel) {
    syncListenerAttached = true;
    return;
  }

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    applySyncMessage(event.data);
  });

  syncListenerAttached = true;
}

export function sweepExpiredRateLimitCooldowns(now: number = Date.now()): void {
  hydratePersistedRateLimitState(now);

  let quotaChanged = false;
  for (const [scope, snapshot] of quotaByScope) {
    if (snapshot.resetAtMs <= now) {
      quotaByScope.delete(scope);
      quotaChanged = true;
    }
  }

  const expiredScopes: KnownRateLimitScope[] = [];
  for (const [scope, resetAtMs] of cooldownByScope) {
    if (resetAtMs <= now) {
      cooldownByScope.delete(scope);
      expiredScopes.push(scope);
    }
  }

  if (expiredScopes.length === 0 && !quotaChanged) {
    return;
  }

  for (const scope of expiredScopes) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      scope,
    });
  }

  persistRateLimitState(now);
  emitChange();
}

export function recordRateLimitCooldown(
  scope: RateLimitScope,
  resetAt: Date,
): void {
  hydratePersistedRateLimitState();

  if (!isKnownRateLimitScope(scope)) {
    return;
  }

  const resetAtMs = resetAt.getTime();
  if (!Number.isFinite(resetAtMs) || resetAtMs <= Date.now()) {
    clearRateLimitCooldown(scope);
    return;
  }

  const existing = cooldownByScope.get(scope);
  if (existing && existing >= resetAtMs) {
    return;
  }

  cooldownByScope.set(scope, resetAtMs);
  broadcast({
    type: "RATE_LIMIT_UPSERT",
    scope,
    resetAtMs,
  });
  persistRateLimitState();
  emitChange();
}

export function recordRateLimitQuota(
  scope: RateLimitScope,
  quota: { limit: number; remaining: number; resetAt: Date },
): void {
  hydratePersistedRateLimitState();

  if (!isKnownRateLimitScope(scope)) {
    return;
  }

  if (!Number.isFinite(quota.limit) || quota.limit <= 0) {
    return;
  }

  if (!Number.isFinite(quota.remaining)) {
    return;
  }

  const resetAtMs = quota.resetAt.getTime();
  if (!Number.isFinite(resetAtMs) || resetAtMs <= Date.now()) {
    quotaByScope.delete(scope);
    persistRateLimitState();
    emitChange();
    return;
  }

  const normalizedRemaining = Math.min(
    Math.max(Math.trunc(quota.remaining), 0),
    Math.trunc(quota.limit),
  );

  const existing = quotaByScope.get(scope);
  if (
    existing &&
    existing.limit === Math.trunc(quota.limit) &&
    existing.remaining === normalizedRemaining &&
    existing.resetAtMs === resetAtMs
  ) {
    return;
  }

  quotaByScope.set(scope, {
    limit: Math.trunc(quota.limit),
    remaining: normalizedRemaining,
    resetAtMs,
  });
  persistRateLimitState();
  emitChange();
}

function clearRateLimitCooldown(scope: KnownRateLimitScope): void {
  hydratePersistedRateLimitState();

  const changed = cooldownByScope.delete(scope);
  if (changed) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      scope,
    });
  }
  persistRateLimitState();
  emitChange();
}

export function getRateLimitQuota(
  scope: RateLimitScope,
  now: number = Date.now(),
): RateLimitQuotaSnapshot | null {
  hydratePersistedRateLimitState(now);

  if (!isKnownRateLimitScope(scope)) {
    return null;
  }

  const quota = quotaByScope.get(scope);
  if (!quota || quota.resetAtMs <= now) {
    return null;
  }

  const used = Math.max(quota.limit - quota.remaining, 0);
  const usagePercent = Math.min(Math.max((used / quota.limit) * 100, 0), 100);

  return {
    scope,
    limit: quota.limit,
    remaining: quota.remaining,
    used,
    usagePercent,
    resetAt: new Date(quota.resetAtMs),
  };
}

export function getRateLimitCooldown(
  scope: RateLimitScope,
  now: number = Date.now(),
): RateLimitCooldownSnapshot | null {
  hydratePersistedRateLimitState(now);

  if (!isKnownRateLimitScope(scope)) {
    return null;
  }

  const resetAtMs = cooldownByScope.get(scope) ?? null;
  if (resetAtMs === null || resetAtMs <= now) {
    return null;
  }

  const retryAfterMs = Math.max(resetAtMs - now, 0);
  return {
    scope,
    resetAt: new Date(resetAtMs),
    retryAfterMs,
    remainingSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 0),
  };
}

export function subscribeRateLimitCooldowns(listener: () => void): () => void {
  hydratePersistedRateLimitState();
  ensureSyncListener();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
