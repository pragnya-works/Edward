import {
  isKnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";
import type {
  RateLimitCooldownSnapshot,
  RateLimitQuotaSnapshot,
} from "./state.types";
import { cooldownByScope, listeners, quotaByScope } from "./state.shared";
import { ensureSyncListener } from "./state.sync";

export function getRateLimitQuota(
  scope: RateLimitScope,
  now: number = Date.now(),
): RateLimitQuotaSnapshot | null {
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
