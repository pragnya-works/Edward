import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";

const refs = vi.hoisted(() => ({
  clearRateLimitCooldown: vi.fn(),
  clearRateLimitQuota: vi.fn(),
  syncRateLimitQuotaSnapshot: vi.fn(),
  syncRateLimitStateOwner: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: refs.useQuery,
}));

vi.mock("@/lib/rateLimit/state.lifecycle", () => ({
  syncRateLimitStateOwner: refs.syncRateLimitStateOwner,
}));

vi.mock("@/lib/rateLimit/state.operations", () => ({
  clearRateLimitCooldown: refs.clearRateLimitCooldown,
  clearRateLimitQuota: refs.clearRateLimitQuota,
  syncRateLimitQuotaSnapshot: refs.syncRateLimitQuotaSnapshot,
}));

describe("useChatDailyQuotaSync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refs.useQuery.mockReturnValue({
      data: undefined,
      isFetchedAfterMount: false,
    });
  });

  it("syncs the rate-limit state owner with the provided user id", async () => {
    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync("user-1");

    expect(refs.syncRateLimitStateOwner).toHaveBeenCalledWith("user-1");
  });

  it("clears daily quota state when the user id is missing", async () => {
    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync(undefined);

    expect(refs.syncRateLimitStateOwner).toHaveBeenCalledWith(null);
    expect(refs.clearRateLimitCooldown).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPE.CHAT_DAILY,
    );
    expect(refs.clearRateLimitQuota).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPE.CHAT_DAILY,
    );
    expect(refs.syncRateLimitQuotaSnapshot).not.toHaveBeenCalled();
  });

  it("does not sync quota before the first fetched result after mount", async () => {
    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync("user-1");

    expect(refs.syncRateLimitQuotaSnapshot).not.toHaveBeenCalled();
  });

  it("does not sync quota when the quota payload is missing", async () => {
    refs.useQuery.mockReturnValue({
      data: { data: undefined },
      isFetchedAfterMount: true,
    });

    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync("user-1");

    expect(refs.syncRateLimitQuotaSnapshot).not.toHaveBeenCalled();
  });

  it("passes a null reset time when the server payload is invalid", async () => {
    refs.useQuery.mockReturnValue({
      data: {
        data: {
          limit: 10,
          remaining: 3,
          resetAtMs: Number.NaN,
          isLimited: false,
        },
      },
      isFetchedAfterMount: true,
    });

    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync("user-1");

    expect(refs.syncRateLimitQuotaSnapshot).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPE.CHAT_DAILY,
      {
        limit: 10,
        remaining: 3,
        resetAt: null,
        isLimited: false,
      },
    );
  });

  it("passes a valid Date when the server payload includes a finite reset time", async () => {
    refs.useQuery.mockReturnValue({
      data: {
        data: {
          limit: 10,
          remaining: 2,
          resetAtMs: 1_700_000_000_000,
          isLimited: false,
        },
      },
      isFetchedAfterMount: true,
    });

    const { useChatDailyQuotaSync } = await import("./useChatDailyQuotaSync");

    useChatDailyQuotaSync("user-1");

    expect(refs.syncRateLimitQuotaSnapshot).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPE.CHAT_DAILY,
      expect.objectContaining({
        limit: 10,
        remaining: 2,
        resetAt: new Date(1_700_000_000_000),
        isLimited: false,
      }),
    );
  });
});
