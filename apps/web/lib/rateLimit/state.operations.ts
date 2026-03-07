import {
  isKnownRateLimitScope,
  type KnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";
import { broadcast } from "./state.sync";
import { emitChange, cooldownByScope, quotaByScope } from "./state.shared";

export function sweepExpiredRateLimitCooldowns(now: number = Date.now()): void {
  const expiredQuotaScopes: KnownRateLimitScope[] = [];
  for (const [scope, snapshot] of quotaByScope) {
    if (snapshot.resetAtMs <= now) {
      quotaByScope.delete(scope);
      expiredQuotaScopes.push(scope);
    }
  }

  const expiredScopes: KnownRateLimitScope[] = [];
  for (const [scope, resetAtMs] of cooldownByScope) {
    if (resetAtMs <= now) {
      cooldownByScope.delete(scope);
      expiredScopes.push(scope);
    }
  }

  if (expiredScopes.length === 0 && expiredQuotaScopes.length === 0) {
    return;
  }

  for (const scope of expiredQuotaScopes) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      resource: "quota",
      scope,
    });
  }

  for (const scope of expiredScopes) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      resource: "cooldown",
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
    resource: "cooldown",
    scope,
    resetAtMs,
  });
  emitChange();
}

export function recordRateLimitQuota(
  scope: RateLimitScope,
  quota: { limit: number; remaining: number; resetAt: Date },
): void {
  if (!isKnownRateLimitScope(scope)) {
    return;
  }

  const normalizedLimit = Number.isFinite(quota.limit) ? Math.trunc(quota.limit) : NaN;
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    return;
  }

  if (!Number.isFinite(quota.remaining)) {
    return;
  }

  const resetAtMs = quota.resetAt.getTime();
  if (!Number.isFinite(resetAtMs) || resetAtMs <= Date.now()) {
    const changed = quotaByScope.delete(scope);
    if (changed) {
      broadcast({
        type: "RATE_LIMIT_CLEAR",
        resource: "quota",
        scope,
      });
      emitChange();
    }
    return;
  }

  const normalizedRemaining = Math.min(
    Math.max(Math.trunc(quota.remaining), 0),
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
  broadcast({
    type: "RATE_LIMIT_UPSERT",
    resource: "quota",
    scope,
    limit: normalizedLimit,
    remaining: normalizedRemaining,
    resetAtMs,
  });
  emitChange();
}

export function clearRateLimitCooldown(scope: RateLimitScope): void {
  if (!isKnownRateLimitScope(scope)) {
    return;
  }
  const changed = cooldownByScope.delete(scope);
  if (changed) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      resource: "cooldown",
      scope,
    });
    emitChange();
  }
}

export function clearRateLimitQuota(scope: RateLimitScope): void {
  if (!isKnownRateLimitScope(scope)) {
    return;
  }

  const changed = quotaByScope.delete(scope);
  if (changed) {
    broadcast({
      type: "RATE_LIMIT_CLEAR",
      resource: "quota",
      scope,
    });
    emitChange();
  }
}

export function syncRateLimitQuotaSnapshot(
  scope: RateLimitScope,
  snapshot: {
    limit: number;
    remaining: number;
    resetAt: Date;
    isLimited?: boolean;
  },
): void {
  recordRateLimitQuota(scope, snapshot);

  if (snapshot.isLimited || snapshot.remaining <= 0) {
    recordRateLimitCooldown(scope, snapshot.resetAt);
    return;
  }

  clearRateLimitCooldown(scope);
}
