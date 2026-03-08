import type { KnownRateLimitScope } from "@/lib/rateLimit/scopes";

export const RATE_LIMIT_BROADCAST_CHANNEL = "edward:rate-limit-sync";

export const cooldownByScope = new Map<KnownRateLimitScope, number>();
export const quotaByScope = new Map<
  KnownRateLimitScope,
  { limit: number; remaining: number; resetAtMs: number }
>();
export const listeners = new Set<() => void>();

export const stateRuntime = {
  syncListenerAttached: false,
  syncChannel: null as BroadcastChannel | null,
  owner: null as string | null,
};

export function isValidResetAtMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}
