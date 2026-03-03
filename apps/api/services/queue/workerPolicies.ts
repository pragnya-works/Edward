import { BuildRecordStatus } from "@edward/shared/api/contracts";
import type { Redis } from "ioredis";
import { ensureError } from "../../utils/error.js";
import { WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS } from "../../utils/constants.js";

export interface WorkerLogger {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
  debug(payload: unknown, message: string): void;
}

export async function publishBuildStatusWithRetry(params: {
  publishClient: Redis;
  logger: WorkerLogger;
  chatId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const channel = `edward:build-status:${params.chatId}`;

  for (let attempt = 1; attempt <= WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS; attempt++) {
    try {
      await params.publishClient.publish(channel, JSON.stringify(params.payload));
      return true;
    } catch (error) {
      if (attempt >= WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS) {
        params.logger.warn(
          {
            error: ensureError(error),
            channel,
            attempt,
            maxAttempts: WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS,
          },
          "[Worker] Build status publish failed after retries",
        );
        return false;
      }

      await delay(attempt * 200);
    }
  }

  return false;
}

export function isTerminalBuildStatus(status: BuildRecordStatus): boolean {
  return status === BuildRecordStatus.SUCCESS || status === BuildRecordStatus.FAILED;
}

export function toBuildStatus(status: string): BuildRecordStatus {
  switch (status) {
    case BuildRecordStatus.QUEUED:
      return BuildRecordStatus.QUEUED;
    case BuildRecordStatus.BUILDING:
      return BuildRecordStatus.BUILDING;
    case BuildRecordStatus.SUCCESS:
      return BuildRecordStatus.SUCCESS;
    case BuildRecordStatus.FAILED:
      return BuildRecordStatus.FAILED;
    default:
      return BuildRecordStatus.QUEUED;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
