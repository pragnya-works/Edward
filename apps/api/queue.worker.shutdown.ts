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
        const cleanupPromise = Promise.all([
          buildWorker.close().finally(() => {
            completionState.buildWorkerClose = true;
          }),
          agentRunWorker.close().finally(() => {
            completionState.agentRunWorkerClose = true;
          }),
          pubClient.quit().finally(() => {
            completionState.pubClientQuit = true;
          }),
        ]);
        const timeoutPromise = new Promise<never>((_, reject) => {
          cleanupTimeoutHandle = setTimeout(() => {
            const timedOutOperations = Object.entries(completionState)
              .filter(([, complete]) => !complete)
              .map(([operation]) => operation);
            const timeoutError = new Error(
              `Graceful shutdown cleanup timed out after ${shutdownTimeoutMs}ms`,
            ) as TimeoutError;
            timeoutError.timedOutOperations = timedOutOperations;
            reject(timeoutError);
          }, shutdownTimeoutMs);
        });

        await Promise.race([cleanupPromise, timeoutPromise]);
      } catch (error) {
        shutdownExitCode = Math.max(shutdownExitCode, 1);
        const timedOutOperations = (error as TimeoutError).timedOutOperations;
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
