import {
  getRunById,
  isTerminalRunStatus,
} from "@edward/auth";
import { redis } from "../../../lib/redis.js";
import {
  ERROR_MESSAGES,
  getRunCancelChannel,
  HttpStatus,
} from "../../../utils/constants.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import { QueryUseCaseError } from "./query.useCaseError.js";
import type {
  ChatRequestContext,
  RunRequestContext,
} from "./requestContext.js";
import {
  cancelActiveRun,
  getActiveRunRecord,
  type RunRecord,
} from "./run.repository.js";

export interface ActiveRunSummary {
  id: string;
  status: string;
  state: string | null;
  currentTurn: number | null;
  createdAt: Date;
  startedAt: Date | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
}

export type CancelRunOutcome =
  | {
    message: "Run already in terminal state";
    data: {
      cancelled: false;
      reason: "already_terminal";
    };
  }
  | {
    message: "Run cancelled";
    data: {
      cancelled: true;
      cancelSignalPublished: boolean;
    };
  }
  | {
    message: "Run is not cancellable in current state";
    data: {
      cancelled: false;
      reason: "not_cancellable_state";
      currentStatus: string;
    };
  };

export async function getActiveRunUseCase(
  context: ChatRequestContext,
): Promise<ActiveRunSummary | null> {
  const activeRun = await getActiveRunRecord({
    chatId: context.chatId,
    userId: context.userId,
  });
  if (!activeRun) {
    return null;
  }

  return {
    id: activeRun.id,
    status: activeRun.status,
    state: activeRun.state,
    currentTurn: activeRun.currentTurn,
    createdAt: activeRun.createdAt,
    startedAt: activeRun.startedAt,
    userMessageId: activeRun.userMessageId,
    assistantMessageId: activeRun.assistantMessageId,
  };
}

export async function cancelRunUseCase(
  context: RunRequestContext,
): Promise<CancelRunOutcome> {
  const runRecord = await getOwnedRunRecordUseCase(context);
  if (isTerminalRunStatus(runRecord.status)) {
    return {
      message: "Run already in terminal state",
      data: {
        cancelled: false,
        reason: "already_terminal",
      },
    };
  }

  const cancellationRequestedAt = new Date();
  const cancelSignalPublished = await publishCancelSignal(context, cancellationRequestedAt);

  const latestRun = (await getRunById(context.runId)) ?? null;
  if (!latestRun) {
    throw new QueryUseCaseError({
      status: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGES.NOT_FOUND,
      code: "RUN_NOT_FOUND",
    });
  }

  if (isTerminalRunStatus(latestRun.status)) {
    return {
      message: "Run already in terminal state",
      data: {
        cancelled: false,
        reason: "already_terminal",
      },
    };
  }

  const cancelledRowsCount = await cancelActiveRun({
    runId: context.runId,
    cancellationRequestedAt,
  });

  if (cancelledRowsCount === 0) {
    const finalRun = (await getRunById(context.runId)) ?? null;
    if (!finalRun || isTerminalRunStatus(finalRun.status)) {
      return {
        message: "Run already in terminal state",
        data: {
          cancelled: false,
          reason: "already_terminal",
        },
      };
    }

    return {
      message: "Run is not cancellable in current state",
      data: {
        cancelled: false,
        reason: "not_cancellable_state",
        currentStatus: finalRun.status,
      },
    };
  }

  logger.info(
    {
      runId: context.runId,
      chatId: context.chatId,
      userId: context.userId,
      cancelPublishFailed: !cancelSignalPublished,
    },
    "Run cancelled by user",
  );

  return {
    message: "Run cancelled",
    data: {
      cancelled: true,
      cancelSignalPublished,
    },
  };
}

export async function getOwnedRunRecordUseCase(
  context: RunRequestContext,
): Promise<RunRecord> {
  const runRecord = (await getRunById(context.runId)) ?? null;
  if (
    !runRecord ||
    runRecord.chatId !== context.chatId ||
    runRecord.userId !== context.userId
  ) {
    throw new QueryUseCaseError({
      status: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGES.NOT_FOUND,
      code: "RUN_NOT_FOUND",
    });
  }
  return runRecord;
}

async function publishCancelSignal(
  context: RunRequestContext,
  cancellationRequestedAt: Date,
): Promise<boolean> {
  try {
    await redis.publish(
      getRunCancelChannel(context.runId),
      JSON.stringify({
        cancelled: true,
        runId: context.runId,
        requestedBy: context.userId,
        requestedAt: cancellationRequestedAt.toISOString(),
      }),
    );
    return true;
  } catch (publishError) {
    logger.warn(
      {
        runId: context.runId,
        chatId: context.chatId,
        userId: context.userId,
        error: ensureError(publishError),
      },
      "Cancel signal publish failed; falling back to durable run cancellation",
    );
    return false;
  }
}
