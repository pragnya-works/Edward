import {
  isKnownRateLimitScope,
  type KnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";

const RATE_LIMIT_BROADCAST_CHANNEL = "edward:rate-limit-sync";

const cooldownByScope = new Map<KnownRateLimitScope, number>();
const listeners = new Set<() => void>();
let syncListenerAttached = false;
let syncChannel: BroadcastChannel | null = null;

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
  const expiredScopes: KnownRateLimitScope[] = [];
  for (const [scope, resetAtMs] of cooldownByScope) {
    if (resetAtMs <= now) {
      cooldownByScope.delete(scope);
      expiredScopes.push(scope);
    }
  }

  if (expiredScopes.length === 0) {
    return;
  }

  for (const scope of expiredScopes) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      scope,
    });
  }

  emitChange();
}

export function recordRateLimitCooldown(
  scope: RateLimitScope,
  resetAt: Date,
): void {
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
  emitChange();
}

function clearRateLimitCooldown(scope: KnownRateLimitScope): void {
  const changed = cooldownByScope.delete(scope);
  if (changed) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      scope,
    });
  }
  emitChange();
}

export function getRateLimitCooldown(
  scope: RateLimitScope,
  now: number = Date.now(),
): RateLimitCooldownSnapshot | null {
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
  ensureSyncListener();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
