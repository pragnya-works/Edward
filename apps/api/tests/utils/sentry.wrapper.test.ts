import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: refs.init,
  captureException: refs.captureException,
}));

describe("sentry wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __edwardSentryInitialized?: boolean })
      .__edwardSentryInitialized;
    delete process.env.SENTRY_DSN;
    vi.stubEnv("NODE_ENV", "development");
  });

  it("forwards captureException without initializing when DSN is absent", async () => {
    const { captureException } = await import("../../utils/sentry.js");

    captureException(new Error("boom"));

    expect(refs.init).not.toHaveBeenCalled();
    expect(refs.captureException).toHaveBeenCalledTimes(1);
  });

  it("initializes Sentry once when DSN is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENTRY_DSN = "https://dsn.example/123";

    await import("../../utils/sentry.js");

    expect(refs.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://dsn.example/123",
        tracesSampleRate: 0.1,
      }),
    );

    await import("../../utils/sentry.js");
    expect(refs.init).toHaveBeenCalledTimes(1);
  });
});
