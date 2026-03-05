import {
  KNOWN_RATE_LIMIT_SCOPES,
  type KnownRateLimitScope,
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

const KNOWN_SCOPE_SET = new Set<string>(KNOWN_RATE_LIMIT_SCOPES);

function handleSyncError(error: unknown, context: "channel_init" | "post_message"): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn("[rateLimit state] sync operation failed", {
    context,
    error,
  });
}

function getKnownScope(payload: Record<string, unknown>): KnownRateLimitScope | null {
  const scope = payload.scope;
  if (typeof scope !== "string" || !KNOWN_SCOPE_SET.has(scope)) {
    return null;
  }
  return scope as KnownRateLimitScope;
}

function ensureSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (stateRuntime.syncChannel) {
    return stateRuntime.syncChannel;
  }

  try {
    stateRuntime.syncChannel = new BroadcastChannel(RATE_LIMIT_BROADCAST_CHANNEL);
  } catch (error: unknown) {
    handleSyncError(error, "channel_init");
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
  } catch (error: unknown) {
    handleSyncError(error, "post_message");
  }
}

function applySyncMessage(message: unknown): void {
  hydratePersistedRateLimitState();

  if (!message || typeof message !== "object") {
    return;
  }

  const payload = message as Record<string, unknown>;
  if (payload.type === "RATE_LIMIT_UPSERT" && payload.resource === "cooldown") {
    const scope = getKnownScope(payload);
    if (!scope) {
      return;
    }
    const resetAtMs = payload.resetAtMs;
    if (!isValidResetAtMs(resetAtMs) || resetAtMs <= Date.now()) {
      return;
    }

    const current = cooldownByScope.get(scope);
    if (typeof current === "number" && resetAtMs <= current) {
      return;
    }

    cooldownByScope.set(scope, resetAtMs);
    persistRateLimitState();
    emitChange();
    return;
  }

  if (payload.type === "RATE_LIMIT_CLEAR" && payload.resource === "cooldown") {
    const scope = getKnownScope(payload);
    if (!scope) {
      return;
    }

    const changed = cooldownByScope.delete(scope);
    if (changed) {
      persistRateLimitState();
      emitChange();
    }
  }

  if (payload.type === "RATE_LIMIT_UPSERT" && payload.resource === "quota") {
    const scope = getKnownScope(payload);
    if (!scope) {
      return;
    }
    const resetAtMs = payload.resetAtMs;
    if (!isValidResetAtMs(resetAtMs) || resetAtMs <= Date.now()) {
      return;
    }

    const normalizedLimit = typeof payload.limit === "number" && Number.isFinite(payload.limit)
      ? Math.trunc(payload.limit)
      : NaN;
    const normalizedRemainingRaw =
      typeof payload.remaining === "number" && Number.isFinite(payload.remaining)
        ? Math.trunc(payload.remaining)
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
    if (existing && existing.resetAtMs > resetAtMs) {
      return;
    }
    if (
      existing &&
      existing.limit === normalizedLimit &&
      existing.remaining === normalizedRemaining &&
      existing.resetAtMs === resetAtMs
    ) {
      return;
    }

    quotaByScope.set(scope, {
      limit: normalizedLimit,
      remaining: normalizedRemaining,
      resetAtMs,
    });
    persistRateLimitState();
    emitChange();
    return;
  }

  if (payload.type === "RATE_LIMIT_CLEAR" && payload.resource === "quota") {
    const scope = getKnownScope(payload);
    if (!scope) {
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
