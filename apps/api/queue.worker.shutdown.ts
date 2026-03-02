interface ShutdownWorkerHandle {
  close(): Promise<unknown>;
}

interface ShutdownPubClient {
  quit(): Promise<unknown>;
}

interface WorkerLogger {
  error(payload: unknown, message: string): void;
}

interface GracefulShutdownDeps {
  buildWorker: ShutdownWorkerHandle;
  agentRunWorker: ShutdownWorkerHandle;
  pubClient: ShutdownPubClient;
  scheduledFlushInterval: ReturnType<typeof setInterval>;
  staleRunReaperInterval: ReturnType<typeof setInterval>;
  logger: WorkerLogger;
  shutdownTimeoutMs: number;
}

type TimeoutError = Error & { timedOutOperations?: string[] };

function createTimeoutError(message: string, timedOutOperations: string[]): TimeoutError {
  return Object.assign(new Error(message), { timedOutOperations });
}

function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof Error && 'timedOutOperations' in err;
}

export function createGracefulShutdown({
  buildWorker,
  agentRunWorker,
  pubClient,
  scheduledFlushInterval,
  staleRunReaperInterval,
  logger,
  shutdownTimeoutMs,
}: GracefulShutdownDeps) {
  let shutdownPromise: Promise<void> | null = null;
  let shutdownExitCode = 0;

  return async function gracefulShutdown(exitCode = 0): Promise<void> {
    shutdownExitCode = Math.max(shutdownExitCode, exitCode);
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      clearInterval(scheduledFlushInterval);
      clearInterval(staleRunReaperInterval);
      let cleanupTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

      try {
        const completionState = {
          buildWorkerClose: false,
          agentRunWorkerClose: false,
          pubClientQuit: false,
        };
        const operationNames = ['buildWorkerClose', 'agentRunWorkerClose', 'pubClientQuit'] as const;
        const cleanupPromise = Promise.allSettled([
          buildWorker.close().finally(() => {
            completionState.buildWorkerClose = true;
          }),
          agentRunWorker.close().finally(() => {
            completionState.agentRunWorkerClose = true;
          }),
          pubClient.quit().finally(() => {
            completionState.pubClientQuit = true;
          }),
        ]).then((results) => {
          const failedOps: string[] = results
            .map((r, i) => (r.status === 'rejected' ? operationNames[i] : null))
            .filter((name): name is (typeof operationNames)[number] => name !== null);
          if (failedOps.length > 0) {
            throw createTimeoutError(
              `Graceful shutdown cleanup failed for: ${failedOps.join(', ')}`,
              failedOps,
            );
          }
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          cleanupTimeoutHandle = setTimeout(() => {
            const timedOutOperations = Object.entries(completionState)
              .filter(([, complete]) => !complete)
              .map(([operation]) => operation);
            reject(createTimeoutError(
              `Graceful shutdown cleanup timed out after ${shutdownTimeoutMs}ms`,
              timedOutOperations,
            ));
          }, shutdownTimeoutMs);
        });

        await Promise.race([cleanupPromise, timeoutPromise]);
      } catch (error) {
        shutdownExitCode = Math.max(shutdownExitCode, 1);
        const timedOutOperations = isTimeoutError(error) ? error.timedOutOperations : undefined;
        if (timedOutOperations && timedOutOperations.length > 0) {
          logger.error(
            {
              error,
              timedOutOperations,
              timeoutMs: shutdownTimeoutMs,
            },
            "[Worker] Graceful shutdown cleanup timed out",
          );
        } else {
          logger.error(
            { error },
            "[Worker] Error during graceful shutdown cleanup",
          );
        }
      } finally {
        if (cleanupTimeoutHandle !== null) {
          clearTimeout(cleanupTimeoutHandle);
        }
        process.exit(shutdownExitCode);
      }
    })();

    return shutdownPromise;
  };
}
