import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResult: vi.fn(),
  createRunWithUserLimit: vi.fn(),
  updateRun: vi.fn(),
  enqueueAgentRunJob: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@edward/auth", async () => {
  const actual = await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: mocks.selectResult,
        })),
      })),
    },
    createRunWithUserLimit: mocks.createRunWithUserLimit,
    updateRun: mocks.updateRun,
  };
});

vi.mock("../../../services/queue/enqueue.js", () => ({
  enqueueAgentRunJob: mocks.enqueueAgentRunJob,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("runAdmission service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResult.mockResolvedValue([{ value: 0 }]);
    mocks.createRunWithUserLimit.mockResolvedValue({
      run: { id: "run-1" },
      rejectedBy: null,
    });
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.enqueueAgentRunJob.mockResolvedValue(undefined);
  });

  it("returns admission window with active depth", async () => {
    const { getRunAdmissionWindow } = await import(
      "../../../services/runs/runAdmission.service.js"
    );

    mocks.selectResult.mockResolvedValueOnce([{ value: 12 }]);
    const window = await getRunAdmissionWindow();

    expect(window.activeRunDepth).toBe(12);
    expect(typeof window.userRunLimit).toBe("number");
    expect(window.overloaded).toBe(false);
  });

  it("delegates run creation with calculated limits", async () => {
    const { createAdmittedRun } = await import(
      "../../../services/runs/runAdmission.service.js"
    );

    const result = await createAdmittedRun({
      chatId: "chat-1",
      userId: "user-1",
      userMessageId: "msg-user",
      assistantMessageId: "msg-assistant",
      metadata: { traceId: "trace-1" },
      userRunLimit: 2,
    });

    expect(result.rejectedBy).toBeNull();
    expect(mocks.createRunWithUserLimit).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", userId: "user-1" }),
      expect.objectContaining({ maxActiveRunsPerUser: 2 }),
    );
  });

  it("enqueues admitted run successfully", async () => {
    const { enqueueAdmittedRun } = await import(
      "../../../services/runs/runAdmission.service.js"
    );

    await expect(enqueueAdmittedRun("run-1")).resolves.toEqual({ queued: true });
  });

  it("marks run failed when enqueue throws", async () => {
    const { enqueueAdmittedRun } = await import(
      "../../../services/runs/runAdmission.service.js"
    );

    mocks.enqueueAgentRunJob.mockRejectedValueOnce(new Error("queue unavailable"));

    const result = await enqueueAdmittedRun("run-2");

    expect(result.queued).toBe(false);
    expect(result.errorMessage).toBe("queue unavailable");
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run-2",
      expect.objectContaining({ state: "FAILED" }),
    );
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });
});
