import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staleQueuedReturning: vi.fn(),
  staleRunningReturning: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

let updateCall = 0;

vi.mock("@edward/auth", async () => {
  const actual = await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    db: {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: (...args: unknown[]) => {
              void args;
              updateCall += 1;
              return updateCall === 1
                ? mocks.staleQueuedReturning()
                : mocks.staleRunningReturning();
            },
          })),
        })),
      })),
    },
  };
});

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("staleRunReaper service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCall = 0;
    mocks.staleQueuedReturning.mockResolvedValue([]);
    mocks.staleRunningReturning.mockResolvedValue([]);
  });

  it("returns stale run counts and logs when reaping occurs", async () => {
    const { reapStaleRuns } = await import(
      "../../../services/runs/staleRunReaper.service.js"
    );

    mocks.staleQueuedReturning.mockResolvedValueOnce([{ id: "q1" }]);
    mocks.staleRunningReturning.mockResolvedValueOnce([{ id: "r1" }, { id: "r2" }]);

    const result = await reapStaleRuns(new Date("2026-03-03T00:00:00.000Z"));

    expect(result).toEqual({ staleQueuedCount: 1, staleRunningCount: 2 });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it("rethrows and logs errors from DB updates", async () => {
    const { reapStaleRuns } = await import(
      "../../../services/runs/staleRunReaper.service.js"
    );

    mocks.staleQueuedReturning.mockRejectedValueOnce(new Error("db exploded"));

    await expect(reapStaleRuns()).rejects.toThrow("db exploded");
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });
});
