import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";

const refs = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  recordRateLimitCooldown: vi.fn(),
  syncRateLimitQuotaSnapshot: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: refs.captureMessage,
}));

vi.mock("@/lib/rateLimit/state.operations", () => ({
  recordRateLimitCooldown: refs.recordRateLimitCooldown,
  syncRateLimitQuotaSnapshot: refs.syncRateLimitQuotaSnapshot,
}));

describe("httpClient quota recording", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips quota recording for endpoints with an unknown rate-limit scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 200,
          headers: {
            "RateLimit-Limit": "10",
            "RateLimit-Remaining": "6",
            "RateLimit-Reset": "1700000000000",
          },
        }),
      ),
    );

    const { fetchApiResponse } = await import("./httpClient");

    await fetchApiResponse("/chat/recent");

    expect(refs.syncRateLimitQuotaSnapshot).not.toHaveBeenCalled();
  });

  it("records the daily quota snapshot for chat message responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 200,
          headers: {
            "RateLimit-Limit": "10",
            "RateLimit-Remaining": "6",
            "RateLimit-Reset": "4102444800000",
          },
        }),
      ),
    );

    const { fetchApiResponse } = await import("./httpClient");

    await fetchApiResponse("/chat/message?draft=1");

    expect(refs.syncRateLimitQuotaSnapshot).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPE.CHAT_DAILY,
      expect.objectContaining({
        limit: 10,
        remaining: 6,
        isLimited: false,
        resetAt: new Date(4102444800000),
      }),
    );
  });
});
