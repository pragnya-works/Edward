import {
  isKnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";
import type { RateLimitSyncMessage } from "./state.types";
import {
  RATE_LIMIT_BROADCAST_CHANNEL,
  cooldownByScope,
  emitChange,
  isValidResetAtMs,
  quotaByScope,
  stateRuntime,
} from "./state.shared";
import {
  hydratePersistedRateLimitState,
  persistRateLimitState,
} from "./state.persistence";

function ensureSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (stateRuntime.syncChannel) {
    return stateRuntime.syncChannel;
  }

  try {
    stateRuntime.syncChannel = new BroadcastChannel(RATE_LIMIT_BROADCAST_CHANNEL);
  } catch {
    stateRuntime.syncChannel = null;
  }

  return stateRuntime.syncChannel;
}

export function broadcast(message: RateLimitSyncMessage): void {
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
  if (payload.type === "RATE_LIMIT_UPSERT" && payload.resource === "cooldown") {
    const scope = payload.scope as RateLimitScope;
    if (!isKnownRateLimitScope(scope)) {
      return;
    }
    if (!isValidResetAtMs(payload.resetAtMs)) {
      return;
    }

    const current = cooldownByScope.get(scope);
    if (typeof current === "number" && payload.resetAtMs <= current) {
      return;
    }

    cooldownByScope.set(scope, payload.resetAtMs);
    persistRateLimitState();
    emitChange();
    return;
  }

  if (payload.type === "RATE_LIMIT_CLEAR" && payload.resource === "cooldown") {
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

  if (payload.type === "RATE_LIMIT_UPSERT" && payload.resource === "quota") {
    const scope = payload.scope as RateLimitScope;
    if (!isKnownRateLimitScope(scope)) {
      return;
    }
    if (!isValidResetAtMs(payload.resetAtMs)) {
      return;
    }

    const normalizedLimit = Number.isFinite(payload.limit)
      ? Math.trunc(Number(payload.limit))
      : NaN;
    const normalizedRemainingRaw = Number.isFinite(payload.remaining)
      ? Math.trunc(Number(payload.remaining))
      : NaN;
    if (
      !Number.isFinite(normalizedLimit) ||
      normalizedLimit <= 0 ||
      !Number.isFinite(normalizedRemainingRaw)
    ) {
      return;
    }

    const normalizedRemaining = Math.min(
      Math.max(normalizedRemainingRaw, 0),
      normalizedLimit,
    );
    const existing = quotaByScope.get(scope);
    if (existing && existing.resetAtMs > payload.resetAtMs) {
      return;
    }
    if (
      existing &&
      existing.limit === normalizedLimit &&
      existing.remaining === normalizedRemaining &&
      existing.resetAtMs === payload.resetAtMs
    ) {
      return;
    }

    quotaByScope.set(scope, {
      limit: normalizedLimit,
      remaining: normalizedRemaining,
      resetAtMs: payload.resetAtMs,
    });
    persistRateLimitState();
    emitChange();
    return;
  }

  if (payload.type === "RATE_LIMIT_CLEAR" && payload.resource === "quota") {
    const scope = payload.scope as RateLimitScope;
    if (!isKnownRateLimitScope(scope)) {
      return;
    }

    const changed = quotaByScope.delete(scope);
    if (changed) {
      persistRateLimitState();
      emitChange();
    }
  }
}

export function ensureSyncListener(): void {
  if (stateRuntime.syncListenerAttached || typeof window === "undefined") {
    return;
  }

  const channel = ensureSyncChannel();
  if (!channel) {
    stateRuntime.syncListenerAttached = true;
    return;
  }

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    applySyncMessage(event.data);
  });

  stateRuntime.syncListenerAttached = true;
}
