import "dotenv/config";
import { Worker } from "bullmq";
import {
  BuildQueueJobPayloadSchema,
  JobPayload,
  JobPayloadSchema,
  JobType,
} from "./services/queue/queue.schemas.js";
import { createLogger } from "./utils/logger.js";
import {
  AGENT_RUN_WORKER_CONCURRENCY,
  BUILD_WORKER_CONCURRENCY,
  CLEANUP_INTERVAL_MS,
  VERSION,
  WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
} from "./utils/constants.js";
import {
  AGENT_RUN_QUEUE_NAME,
  BUILD_QUEUE_NAME,
  connection,
} from "./lib/queue.binding.js";
import { createRedisClient } from "./lib/redis.js";
import { processScheduledFlushes } from "./services/sandbox/write/flush.scheduler.js";
import { reapStaleRuns } from "./services/runs/staleRunReaper.service.js";
import { registerWorkerEventHandlers } from "./queue.worker.events.js";
import { createGracefulShutdown } from "./queue.worker.shutdown.js";
import { registerProcessHandlerOnce } from "./utils/processHandlers.js";
import { ensureError } from "./utils/error.js";
import {
  isSandboxEnabled,
  isSandboxRuntimeAvailable,
} from "./services/sandbox/lifecycle/control.js";
import {
  processAgentRun,
  processBackupJob,
  processBuildJob,
} from "./services/queue/workerJobHandlers.service.js";

const logger = createLogger("WORKER");
const pubClient = createRedisClient();

async function verifyWorkerDependencies(): Promise<void> {
  if (isSandboxEnabled()) {
    const dockerAvailable = await isSandboxRuntimeAvailable();
    if (!dockerAvailable) {
      throw new Error(
        "Sandbox service is enabled but Docker runtime is unavailable.",
      );
    }
  } else {
    logger.warn(
      "Sandbox Service disabled (SANDBOX_ENABLED=false). Build sandbox operations are unavailable.",
    );
  }

  const response = await pubClient.ping();
  if (typeof response !== "string" || response.toUpperCase() !== "PONG") {
    throw new Error(`Unexpected Redis ping response: ${String(response)}`);
  }
}

function createBuildWorker(): Worker<JobPayload> {
  return new Worker<JobPayload>(
    BUILD_QUEUE_NAME,
    async (job) => {
      const parsedPayload = BuildQueueJobPayloadSchema.safeParse(job.data);
      if (!parsedPayload.success) {
        return throwUnsupportedBuildQueuePayload(getPayloadType(job.data));
      }

      const payload = parsedPayload.data;

      switch (payload.type) {
        case JobType.BUILD:
          return processBuildJob({ payload, publishClient: pubClient, logger });
        case JobType.BACKUP:
          return processBackupJob({ payload, logger });
      }
    },
    {
      connection,
      concurrency: BUILD_WORKER_CONCURRENCY,
    },
  );
}

function createAgentRunWorker(): Worker<JobPayload> {
  return new Worker<JobPayload>(
    AGENT_RUN_QUEUE_NAME,
    async (job) => {
      const payload = JobPayloadSchema.parse(job.data);

      if (payload.type !== JobType.AGENT_RUN) {
        logger.error(
          { type: payload.type },
          "[Worker] Unsupported payload type on agent-run queue",
        );
        throw new Error(`Unsupported agent-run queue job type: ${payload.type}`);
      }

      return processAgentRun({ runId: payload.runId, publishClient: pubClient });
    },
    {
      connection,
      concurrency: AGENT_RUN_WORKER_CONCURRENCY,
    },
  );
}

function startScheduledFlushInterval(): NodeJS.Timeout {
  const interval = setInterval(() => {
    void processScheduledFlushes().catch((error: unknown) =>
      logger.error(
        { error: ensureError(error) },
        "[Worker] Scheduled sandbox flush processing failed",
      ),
    );
  }, 250);
  interval.unref();
  return interval;
}

function startStaleRunReaperInterval(): NodeJS.Timeout {
  const interval = setInterval(() => {
    void reapStaleRuns().catch((error: unknown) =>
      logger.error(
        { error: ensureError(error) },
        "[Worker] Stale run reaper failed",
      ),
    );
  }, CLEANUP_INTERVAL_MS);
  interval.unref();
  return interval;
}

function registerWorkerProcessHandlers(
  gracefulShutdown: (exitCode?: number) => Promise<void>,
): void {
  registerProcessHandlerOnce("worker:SIGINT", "SIGINT", () => {
    void gracefulShutdown();
  });
  registerProcessHandlerOnce("worker:SIGTERM", "SIGTERM", () => {
    void gracefulShutdown();
  });
  registerProcessHandlerOnce(
    "worker:uncaughtException",
    "uncaughtException",
    (error) => {
      logger.fatal(ensureError(error), "[Worker] Uncaught Exception");
      void gracefulShutdown(1);
    },
  );
  registerProcessHandlerOnce(
    "worker:unhandledRejection",
    "unhandledRejection",
    (reason) => {
      logger.fatal(
        { reason: ensureError(reason) },
        "[Worker] Unhandled Rejection",
      );
      void gracefulShutdown(1);
    },
  );
}

function logWorkerStarted(): void {
  logger.info(
    {
      version: VERSION,
      buildWorkerConcurrency: BUILD_WORKER_CONCURRENCY,
      agentRunWorkerConcurrency: AGENT_RUN_WORKER_CONCURRENCY,
    },
    "[Worker] Started listening for jobs",
  );
}

async function bootstrapWorker(): Promise<void> {
  try {
    await verifyWorkerDependencies();
  } catch (error) {
    logger.fatal(
      ensureError(error),
      "[Worker] Startup dependency check failed",
    );
    process.exit(1);
    return;
  }

  const buildWorker = createBuildWorker();
  const agentRunWorker = createAgentRunWorker();
  const scheduledFlushInterval = startScheduledFlushInterval();
  const staleRunReaperInterval = startStaleRunReaperInterval();

  registerWorkerEventHandlers({
    buildWorker,
    agentRunWorker,
    logger,
  });

  const gracefulShutdown = createGracefulShutdown({
    buildWorker,
    agentRunWorker,
    pubClient,
    scheduledFlushInterval,
    staleRunReaperInterval,
    logger,
    shutdownTimeoutMs: WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  });
  registerWorkerProcessHandlers(gracefulShutdown);
  logWorkerStarted();
}

await bootstrapWorker();

function throwUnsupportedBuildQueuePayload(type: string): never {
  logger.error(
    { type },
    "[Worker] Unsupported payload type on build queue",
  );
  throw new Error(`Unsupported build queue job type: ${type}`);
}

function getPayloadType(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "unknown";
  }
  const maybeType = (payload as { type?: unknown }).type;
  return typeof maybeType === "string" ? maybeType : "unknown";
}
