import { and, db, inArray, isNull, lt, or, run, RUN_STATUS } from "@edward/auth";
import {
  RUN_MAX_QUEUED_AGE_MS,
  RUN_MAX_RUNNING_AGE_MS,
} from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";

interface ReaperResult {
  staleQueuedCount: number;
  staleRunningCount: number;
}

export async function reapStaleRuns(now = new Date()): Promise<ReaperResult> {
  const queuedCutoff = new Date(now.getTime() - RUN_MAX_QUEUED_AGE_MS);
  const runningCutoff = new Date(now.getTime() - RUN_MAX_RUNNING_AGE_MS);

  try {
    const staleQueuedRows = await db
      .update(run)
      .set({
        status: RUN_STATUS.FAILED,
        state: "FAILED",
        terminationReason: "stale_queued_timeout",
        errorMessage: "Run expired in queue before processing.",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(run.status, [RUN_STATUS.QUEUED]),
          lt(run.createdAt, queuedCutoff),
        ),
      )
      .returning({ id: run.id });

    const staleRunningRows = await db
      .update(run)
      .set({
        status: RUN_STATUS.FAILED,
        state: "FAILED",
        terminationReason: "stale_running_timeout",
        errorMessage: "Run exceeded maximum allowed execution time.",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(run.status, [RUN_STATUS.RUNNING]),
          or(
            and(isNull(run.startedAt), lt(run.createdAt, runningCutoff)),
            lt(run.startedAt, runningCutoff),
          ),
        ),
      )
      .returning({ id: run.id });

    const staleQueuedCount = staleQueuedRows.length;
    const staleRunningCount = staleRunningRows.length;

    if (staleQueuedCount > 0 || staleRunningCount > 0) {
      logger.warn(
        {
          staleQueuedCount,
          staleRunningCount,
          queuedCutoff,
          runningCutoff,
        },
        "Reaped stale runs",
      );
    }

    return {
      staleQueuedCount,
      staleRunningCount,
    };
  } catch (error) {
    logger.error(
      {
        error: ensureError(error),
        queuedCutoff,
        runningCutoff,
      },
      "Failed to reap stale runs",
    );
    throw error;
  }
}
