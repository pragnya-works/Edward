import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";
import {
  cooldownByScope,
  quotaByScope,
} from "@/lib/rateLimit/state.shared";
import {
  recordRateLimitQuota,
  syncRateLimitQuotaSnapshot,
} from "@/lib/rateLimit/state.operations";

describe("rate limit state operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    cooldownByScope.clear();
    quotaByScope.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cooldownByScope.clear();
    quotaByScope.clear();
  });

  it("returns success when quota recording writes a valid snapshot", () => {
    const resetAt = new Date("2024-01-01T00:10:00.000Z");

    const didRecord = recordRateLimitQuota(RATE_LIMIT_SCOPE.CHAT_DAILY, {
      limit: 10,
      remaining: 4,
      resetAt,
    });

    expect(didRecord).toBe(true);
    expect(quotaByScope.get(RATE_LIMIT_SCOPE.CHAT_DAILY)).toEqual({
      limit: 10,
      remaining: 4,
      resetAtMs: resetAt.getTime(),
    });
  });

  it("does not create a cooldown when quota recording fails", () => {
    syncRateLimitQuotaSnapshot(RATE_LIMIT_SCOPE.CHAT_DAILY, {
      limit: 10,
      remaining: 0,
      resetAt: null,
      isLimited: true,
    });

    expect(quotaByScope.has(RATE_LIMIT_SCOPE.CHAT_DAILY)).toBe(false);
    expect(cooldownByScope.has(RATE_LIMIT_SCOPE.CHAT_DAILY)).toBe(false);
  });

  it("does not clear an existing cooldown when quota recording fails", () => {
    const existingResetAtMs = new Date("2024-01-01T00:10:00.000Z").getTime();
    cooldownByScope.set(RATE_LIMIT_SCOPE.CHAT_DAILY, existingResetAtMs);

    const didRecord = recordRateLimitQuota(RATE_LIMIT_SCOPE.CHAT_DAILY, {
      limit: 0,
      remaining: 4,
      resetAt: new Date("2024-01-01T00:10:00.000Z"),
    });

    expect(didRecord).toBe(false);
    expect(cooldownByScope.get(RATE_LIMIT_SCOPE.CHAT_DAILY)).toBe(existingResetAtMs);
  });
});
