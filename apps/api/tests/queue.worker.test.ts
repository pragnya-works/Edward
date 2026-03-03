import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobType } from "../services/queue/queue.schemas.js";

const refs = vi.hoisted(() => {
  const workerInstances: Array<{
    queueName: string;
    processor: (job: { data: unknown }) => Promise<unknown>;
    options: unknown;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    workerInstances,
    createRedisClient: vi.fn(() => ({ publish: vi.fn(), quit: vi.fn() })),
    processBuildJob: vi.fn(async () => ({ ok: true })),
    processBackupJob: vi.fn(async () => ({ ok: true })),
    processAgentRun: vi.fn(async () => ({ ok: true })),
    processScheduledFlushes: vi.fn(async () => undefined),
    reapStaleRuns: vi.fn(async () => undefined),
    registerWorkerEventHandlers: vi.fn(),
    createGracefulShutdown: vi.fn(() => vi.fn(async () => undefined)),
    registerProcessHandlerOnce: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  };
});

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(
      queueName: string,
      processor: (job: { data: unknown }) => Promise<unknown>,
      options: unknown,
    ) {
      refs.workerInstances.push({
        queueName,
        processor,
        options,
        close: vi.fn(async () => undefined),
      });
    }
  },
}));

vi.mock("../lib/queue.binding.js", () => ({
  AGENT_RUN_QUEUE_NAME: "agent-run-queue",
  BUILD_QUEUE_NAME: "build-queue",
  connection: { host: "redis://mock" },
}));

vi.mock("../lib/redis.js", () => ({
  createRedisClient: refs.createRedisClient,
}));

vi.mock("../services/queue/workerJobHandlers.service.js", () => ({
  processBuildJob: refs.processBuildJob,
  processBackupJob: refs.processBackupJob,
  processAgentRun: refs.processAgentRun,
}));

vi.mock("../services/sandbox/write/flush.scheduler.js", () => ({
  processScheduledFlushes: refs.processScheduledFlushes,
}));

vi.mock("../services/runs/staleRunReaper.service.js", () => ({
  reapStaleRuns: refs.reapStaleRuns,
}));

vi.mock("../queue.worker.events.js", () => ({
  registerWorkerEventHandlers: refs.registerWorkerEventHandlers,
}));

vi.mock("../queue.worker.shutdown.js", () => ({
  createGracefulShutdown: refs.createGracefulShutdown,
}));

vi.mock("../utils/processHandlers.js", () => ({
  registerProcessHandlerOnce: refs.registerProcessHandlerOnce,
}));

vi.mock("../utils/logger.js", () => ({
  createLogger: vi.fn(() => refs.logger),
}));

vi.mock("../utils/error.js", () => ({
  ensureError: refs.ensureError,
}));

describe("queue.worker bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refs.workerInstances.length = 0;
  });

  function requireWorker(queueName: string) {
    const worker = refs.workerInstances.find((entry) => entry.queueName === queueName);
    expect(worker).toBeDefined();
    if (!worker) {
      throw new Error(`Missing worker for queue: ${queueName}`);
    }
    return worker;
  }

  it("registers workers, events, and process handlers on bootstrap", async () => {
    await import("../queue.worker.js");

    const queueNames = refs.workerInstances.map((entry) => entry.queueName);
    expect(queueNames).toEqual(["build-queue", "agent-run-queue"]);

    expect(refs.registerWorkerEventHandlers).toHaveBeenCalledTimes(1);
    expect(refs.registerProcessHandlerOnce).toHaveBeenCalledTimes(4);
    expect(refs.createGracefulShutdown).toHaveBeenCalledTimes(1);
    expect(refs.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        buildWorkerConcurrency: expect.any(Number),
        agentRunWorkerConcurrency: expect.any(Number),
      }),
      "[Worker] Started listening for jobs",
    );
  });

  it("routes jobs to the correct handler and rejects mismatched queue payloads", async () => {
    await import("../queue.worker.js");

    const buildQueueWorker = requireWorker("build-queue");
    const agentQueueWorker = requireWorker("agent-run-queue");

    await buildQueueWorker.processor({
      data: {
        type: JobType.BUILD,
        sandboxId: "sandbox-1",
        userId: "user-1",
        chatId: "chat-1",
        messageId: "message-1",
      },
    });
    expect(refs.processBuildJob).toHaveBeenCalledTimes(1);

    await buildQueueWorker.processor({
      data: {
        type: JobType.BACKUP,
        sandboxId: "sandbox-1",
        userId: "user-1",
      },
    });
    expect(refs.processBackupJob).toHaveBeenCalledTimes(1);

    await expect(
      buildQueueWorker.processor({
        data: {
          type: JobType.AGENT_RUN,
          runId: "run-1",
        },
      }),
    ).rejects.toThrow("Unsupported build queue job type: agent_run");

    await agentQueueWorker.processor({
      data: {
        type: JobType.AGENT_RUN,
        runId: "run-2",
      },
    });
    expect(refs.processAgentRun).toHaveBeenCalledWith({
      runId: "run-2",
      publishClient: expect.any(Object),
    });

    await expect(
      agentQueueWorker.processor({
        data: {
          type: JobType.BUILD,
          sandboxId: "sandbox-2",
          userId: "user-2",
          chatId: "chat-2",
          messageId: "message-2",
        },
      }),
    ).rejects.toThrow("Unsupported agent-run queue job type: build");
  });
});
