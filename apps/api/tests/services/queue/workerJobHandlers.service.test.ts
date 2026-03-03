import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { JobType } from "../../../services/queue/queue.schemas.js";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  createBuild: vi.fn(),
  updateBuild: vi.fn(),
  buildAndUploadUnified: vi.fn(),
  backupSandboxInstance: vi.fn(),
  getSandboxState: vi.fn(),
  enqueueBackupJob: vi.fn(),
  processAgentRunJob: vi.fn(),
  createErrorReportIfPossible: vi.fn(),
  publishBuildStatusWithRetry: vi.fn(),
  isTerminalBuildStatus: vi.fn(),
  toBuildStatus: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock("@edward/auth", () => ({
  build: {
    id: "id",
    status: "status",
    previewUrl: "previewUrl",
    errorReport: "errorReport",
  },
  createBuild: mocks.createBuild,
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.selectLimit,
        })),
      })),
    })),
  },
  eq: vi.fn(),
  updateBuild: mocks.updateBuild,
}));

vi.mock("../../../services/sandbox/builder/unified-build/orchestrator.js", () => ({
  buildAndUploadUnified: mocks.buildAndUploadUnified,
}));

vi.mock("../../../services/sandbox/backup.service.js", () => ({
  backupSandboxInstance: mocks.backupSandboxInstance,
}));

vi.mock("../../../services/sandbox/state.service.js", () => ({
  getSandboxState: mocks.getSandboxState,
}));

vi.mock("../../../services/queue/enqueue.js", () => ({
  enqueueBackupJob: mocks.enqueueBackupJob,
}));

vi.mock("../../../services/runs/agent-run-worker/processor.js", () => ({
  processAgentRunJob: mocks.processAgentRunJob,
}));

vi.mock("../../../queue.worker.helpers.js", () => ({
  createErrorReportIfPossible: mocks.createErrorReportIfPossible,
}));

vi.mock("../../../services/queue/workerPolicies.js", () => ({
  isTerminalBuildStatus: mocks.isTerminalBuildStatus,
  publishBuildStatusWithRetry: mocks.publishBuildStatusWithRetry,
  toBuildStatus: mocks.toBuildStatus,
  withTimeout: mocks.withTimeout,
}));

describe("workerJobHandlers service", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([
      {
        id: "build-1",
        status: BuildRecordStatus.QUEUED,
        previewUrl: null,
        errorReport: null,
      },
    ]);
    mocks.createBuild.mockResolvedValue({
      id: "build-new",
      status: BuildRecordStatus.QUEUED,
      previewUrl: null,
      errorReport: null,
    });
    mocks.updateBuild.mockResolvedValue(undefined);
    mocks.buildAndUploadUnified.mockResolvedValue({
      success: true,
      previewUrl: "https://preview.example",
      buildDirectory: "dist",
      previewUploaded: true,
    });
    mocks.backupSandboxInstance.mockResolvedValue(undefined);
    mocks.getSandboxState.mockResolvedValue({ id: "sb-1" });
    mocks.enqueueBackupJob.mockResolvedValue(undefined);
    mocks.processAgentRunJob.mockResolvedValue(undefined);
    mocks.createErrorReportIfPossible.mockResolvedValue({
      errorReport: { title: "Build failed" },
    });
    mocks.publishBuildStatusWithRetry.mockResolvedValue(true);
    mocks.isTerminalBuildStatus.mockReturnValue(false);
    mocks.toBuildStatus.mockImplementation((status) => status);
    mocks.withTimeout.mockImplementation(async (promise: Promise<unknown>) => await promise);
  });

  it("skips duplicate terminal build jobs and republishes status", async () => {
    const { processBuildJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    mocks.selectLimit.mockResolvedValueOnce([
      {
        id: "build-1",
        status: BuildRecordStatus.SUCCESS,
        previewUrl: "https://preview.example",
        errorReport: null,
      },
    ]);
    mocks.isTerminalBuildStatus.mockReturnValueOnce(true);

    await processBuildJob({
      payload: {
        type: JobType.BUILD,
        sandboxId: "sb-1",
        chatId: "chat-1",
        messageId: "msg-1",
        userId: "user-1",
        buildId: "build-1",
      },
      publishClient: { publish: vi.fn() } as never,
      logger,
    });

    expect(mocks.updateBuild).not.toHaveBeenCalled();
    expect(mocks.publishBuildStatusWithRetry).toHaveBeenCalledTimes(1);
  });

  it("processes successful build, updates status, and enqueues backup", async () => {
    const { processBuildJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    await processBuildJob({
      payload: {
        type: JobType.BUILD,
        sandboxId: "sb-1",
        chatId: "chat-1",
        messageId: "msg-1",
        userId: "user-1",
        runId: "run-1",
      },
      publishClient: { publish: vi.fn() } as never,
      logger,
    });

    expect(mocks.createBuild).toHaveBeenCalledTimes(1);
    expect(mocks.updateBuild).toHaveBeenNthCalledWith(1, "build-new", {
      status: BuildRecordStatus.BUILDING,
    });
    expect(mocks.updateBuild).toHaveBeenNthCalledWith(
      2,
      "build-new",
      expect.objectContaining({
        status: BuildRecordStatus.SUCCESS,
        previewUrl: "https://preview.example",
      }),
    );
    expect(mocks.enqueueBackupJob).toHaveBeenCalledWith({
      sandboxId: "sb-1",
      userId: "user-1",
    });
  });

  it("handles failed build by persisting failure state and rethrowing", async () => {
    const { processBuildJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    mocks.buildAndUploadUnified.mockResolvedValueOnce({
      success: false,
      error: "compile failed",
    });

    await expect(
      processBuildJob({
        payload: {
          type: JobType.BUILD,
          sandboxId: "sb-1",
          chatId: "chat-1",
          messageId: "msg-1",
          userId: "user-1",
          buildId: "build-1",
        },
        publishClient: { publish: vi.fn() } as never,
        logger,
      }),
    ).rejects.toThrow("compile failed");

    expect(mocks.createErrorReportIfPossible).toHaveBeenCalledWith(
      "sb-1",
      "compile failed",
      logger,
    );
    expect(mocks.updateBuild).toHaveBeenCalledWith(
      "build-1",
      expect.objectContaining({ status: BuildRecordStatus.FAILED }),
    );
  });

  it("finalizes failure when build execution throws unexpectedly", async () => {
    const { processBuildJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    mocks.withTimeout.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      processBuildJob({
        payload: {
          type: JobType.BUILD,
          sandboxId: "sb-9",
          chatId: "chat-9",
          messageId: "msg-9",
          userId: "user-1",
          buildId: "build-1",
        },
        publishClient: { publish: vi.fn() } as never,
        logger,
      }),
    ).rejects.toThrow("timeout");

    expect(mocks.createErrorReportIfPossible).toHaveBeenCalledWith(
      "sb-9",
      "timeout",
      logger,
    );
  });

  it("backs up sandbox when state exists", async () => {
    const { processBackupJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    await processBackupJob({
      payload: {
        type: JobType.BACKUP,
        sandboxId: "sb-1",
        userId: "user-1",
      },
      logger,
    });

    expect(mocks.backupSandboxInstance).toHaveBeenCalledWith({ id: "sb-1" });
  });

  it("warns and returns when backup sandbox state is missing", async () => {
    const { processBackupJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    mocks.getSandboxState.mockResolvedValueOnce(null);

    await processBackupJob({
      payload: {
        type: JobType.BACKUP,
        sandboxId: "sb-2",
        userId: "user-1",
      },
      logger,
    });

    expect(mocks.backupSandboxInstance).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("throws when backup execution fails", async () => {
    const { processBackupJob } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    mocks.backupSandboxInstance.mockRejectedValueOnce(new Error("backup failed"));

    await expect(
      processBackupJob({
        payload: {
          type: JobType.BACKUP,
          sandboxId: "sb-3",
          userId: "user-1",
        },
        logger,
      }),
    ).rejects.toThrow("backup failed");

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("delegates agent-run jobs", async () => {
    const { processAgentRun } = await import(
      "../../../services/queue/workerJobHandlers.service.js"
    );

    await processAgentRun({
      runId: "run-42",
      publishClient: { publish: vi.fn() } as never,
    });

    expect(mocks.processAgentRunJob).toHaveBeenCalledWith(
      "run-42",
      expect.any(Object),
    );
  });
});
