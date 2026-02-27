import { getSandboxState } from "./services/sandbox/state.service.js";
import { createErrorReport } from "./services/diagnostics/errorReport.js";

const processHandlerState = globalThis as typeof globalThis & {
  __edwardProcessHandlers?: Map<string, (...args: unknown[]) => void>;
};

type WorkerLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
};

export function registerProcessHandlerOnce(
  key: string,
  event: "SIGINT" | "SIGTERM",
  handler: (...args: unknown[]) => void,
): void {
  const registry = processHandlerState.__edwardProcessHandlers ?? new Map();
  processHandlerState.__edwardProcessHandlers = registry;

  const existing = registry.get(key);
  if (existing) {
    process.off(event, existing as never);
  }

  process.on(event, handler as never);
  registry.set(key, handler);
}

export async function createErrorReportIfPossible(
  sandboxId: string,
  error: string | undefined,
  logger: WorkerLogger,
): Promise<{ errorReport: unknown }> {
  if (!error) {
    return { errorReport: null };
  }

  const sandbox = await getSandboxState(sandboxId);
  const containerId = sandbox?.containerId;

  if (!containerId) {
    return { errorReport: null };
  }

  try {
    const report = await createErrorReport(
      containerId,
      error,
      sandbox?.scaffoldedFramework,
    );

    logger.info(
      {
        sandboxId,
        errorCount: report.summary.totalErrors,
        processed: report.errors.length,
        types: report.summary.uniqueTypes,
      },
      "[Worker] Error report created",
    );

    return { errorReport: report as unknown };
  } catch (err) {
    logger.warn(
      { error: err, sandboxId },
      "[Worker] Error report creation failed",
    );
    return { errorReport: null };
  }
}
