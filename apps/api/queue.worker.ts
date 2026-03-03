import "dotenv/config";
import { Worker } from "bullmq";
import {
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
  processAgentRun,
  processBackupJob,
  processBuildJob,
} from "./services/queue/workerJobHandlers.service.js";

const logger = createLogger("WORKER");
const pubClient = createRedisClient();

const buildWorker = new Worker<JobPayload>(
  BUILD_QUEUE_NAME,
  async (job) => {
    const payload = JobPayloadSchema.parse(job.data);

    switch (payload.type) {
      case JobType.BUILD:
        return processBuildJob({ payload, publishClient: pubClient, logger });
      case JobType.BACKUP:
        return processBackupJob({ payload, logger });
      default:
        return throwUnsupportedBuildQueuePayload(payload.type);
    }
  },
  {
    connection,
    concurrency: BUILD_WORKER_CONCURRENCY,
  },
);

const agentRunWorker = new Worker<JobPayload>(
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

const scheduledFlushInterval = setInterval(() => {
  void processScheduledFlushes().catch((error: unknown) =>
    logger.error(
      { error: ensureError(error) },
      "[Worker] Scheduled sandbox flush processing failed",
    ),
  );
}, 250);
scheduledFlushInterval.unref();

const staleRunReaperInterval = setInterval(() => {
  void reapStaleRuns().catch((error: unknown) =>
    logger.error({ error: ensureError(error) }, "[Worker] Stale run reaper failed"),
  );
}, CLEANUP_INTERVAL_MS);
staleRunReaperInterval.unref();

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

logger.info(
  {
    version: VERSION,
    buildWorkerConcurrency: BUILD_WORKER_CONCURRENCY,
    agentRunWorkerConcurrency: AGENT_RUN_WORKER_CONCURRENCY,
  },
  "[Worker] Started listening for jobs",
);

function throwUnsupportedBuildQueuePayload(type: string): never {
  logger.error(
    { type },
    "[Worker] Unsupported payload type on build queue",
  );
  throw new Error(`Unsupported build queue job type: ${type}`);
}
