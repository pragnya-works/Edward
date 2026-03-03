import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import {
  isTerminalBuildStatus,
  publishBuildStatusWithRetry,
  toBuildStatus,
  withTimeout,
} from "../../../services/queue/workerPolicies.js";

describe("workerPolicies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps build status strings safely", () => {
    expect(toBuildStatus(BuildRecordStatus.QUEUED)).toBe(BuildRecordStatus.QUEUED);
    expect(toBuildStatus(BuildRecordStatus.BUILDING)).toBe(BuildRecordStatus.BUILDING);
    expect(toBuildStatus(BuildRecordStatus.SUCCESS)).toBe(BuildRecordStatus.SUCCESS);
    expect(toBuildStatus(BuildRecordStatus.FAILED)).toBe(BuildRecordStatus.FAILED);
    expect(toBuildStatus("unknown")).toBe(BuildRecordStatus.QUEUED);
  });

  it("detects terminal build statuses", () => {
    expect(isTerminalBuildStatus(BuildRecordStatus.SUCCESS)).toBe(true);
    expect(isTerminalBuildStatus(BuildRecordStatus.FAILED)).toBe(true);
    expect(isTerminalBuildStatus(BuildRecordStatus.BUILDING)).toBe(false);
  });

  it("publishes build status successfully", async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const ok = await publishBuildStatusWithRetry({
      publishClient: { publish } as never,
      logger,
      chatId: "chat-1",
      payload: { status: BuildRecordStatus.BUILDING },
    });

    expect(ok).toBe(true);
    expect(publish).toHaveBeenCalledWith(
      "edward:build-status:chat-1",
      JSON.stringify({ status: BuildRecordStatus.BUILDING }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("retries and logs when publish keeps failing", async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockRejectedValue(new Error("redis down"));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const task = publishBuildStatusWithRetry({
      publishClient: { publish } as never,
      logger,
      chatId: "chat-2",
      payload: { status: BuildRecordStatus.FAILED },
    });

    await vi.runAllTimersAsync();
    const ok = await task;

    expect(ok).toBe(false);
    expect(publish).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("resolves before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "timed out")).resolves.toBe(
      "ok",
    );
  });

  it("rejects when timeout wins", async () => {
    const slow = new Promise<string>(() => {
      // Intentionally never resolves
    });

    await expect(withTimeout(slow, 1, "timed out")).rejects.toThrow("timed out");
  });
});
