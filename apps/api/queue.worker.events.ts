interface WorkerJobLike {
  id?: string | number;
  name?: string;
}

interface WorkerLike {
  on(event: "completed", listener: (job: WorkerJobLike) => void): void;
  on(
    event: "failed",
    listener: (job: WorkerJobLike | undefined, error: unknown) => void,
  ): void;
  on(event: "error", listener: (error: unknown) => void): void;
}

interface WorkerLogger {
  debug(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
}

interface RegisterWorkerEventHandlersParams {
  buildWorker: WorkerLike;
  agentRunWorker: WorkerLike;
  logger: WorkerLogger;
}

export function registerWorkerEventHandlers({
  buildWorker,
  agentRunWorker,
  logger,
}: RegisterWorkerEventHandlersParams): void {
  buildWorker.on("completed", (job) => {
    logger.debug({ jobId: job.id, jobName: job.name }, "[Worker] Job completed");
  });

  buildWorker.on("failed", (job, error) => {
    logger.error(
      { error, jobId: job?.id, jobName: job?.name },
      "[Worker] Job failed",
    );
  });

  buildWorker.on("error", (error) => {
    logger.error({ error }, "[Worker] Build worker error");
  });

  agentRunWorker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, jobName: job.name },
      "[Worker] Agent run job completed",
    );
  });

  agentRunWorker.on("failed", (job, error) => {
    logger.error(
      { error, jobId: job?.id, jobName: job?.name },
      "[Worker] Agent run job failed",
    );
  });

  agentRunWorker.on("error", (error) => {
    logger.error({ error }, "[Worker] Worker error");
  });
}
