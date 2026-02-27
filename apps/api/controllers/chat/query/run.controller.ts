import type { Response } from "express";
import {
  and,
  ACTIVE_RUN_STATUSES,
  db,
  desc,
  eq,
  getRunById,
  isTerminalRunStatus,
  inArray,
  RUN_STATUS,
  run,
  updateRun,
} from "@edward/auth";
import { redis } from "../../../lib/redis.js";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import {
  ERROR_MESSAGES,
  HttpStatus,
} from "../../../utils/constants.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../../../utils/response.js";
import { assertChatOwnedOrRespond, getChatIdOrRespond } from "../access/chatAccess.service.js";
import { sendSSEDone } from "../sse.utils.js";
import { streamRunEventsFromPersistence } from "../../../services/runEventStream.utils/service.js";

const RUN_CANCEL_CHANNEL_PREFIX = "edward:run-cancel:";

export async function getActiveRun(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      return;
    }

    const [activeRun] = await db
      .select({
        id: run.id,
        status: run.status,
        state: run.state,
        currentTurn: run.currentTurn,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        userMessageId: run.userMessageId,
        assistantMessageId: run.assistantMessageId,
      })
      .from(run)
      .where(
        and(
          eq(run.chatId, chatId),
          eq(run.userId, userId),
          inArray(run.status, ACTIVE_RUN_STATUSES),
        ),
      )
      .orderBy(desc(run.createdAt))
      .limit(1);

    sendSuccess(res, HttpStatus.OK, "Active run retrieved successfully", {
      chatId,
      run: activeRun
        ? {
          id: activeRun.id,
          status: activeRun.status,
          state: activeRun.state,
          currentTurn: activeRun.currentTurn,
          createdAt: activeRun.createdAt,
          startedAt: activeRun.startedAt,
          userMessageId: activeRun.userMessageId,
          assistantMessageId: activeRun.assistantMessageId,
        }
        : null,
    });
  } catch (error) {
    logger.error(ensureError(error), "getActiveRun error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function cancelRunHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);
    const runId =
      typeof req.params.runId === "string" ? req.params.runId : undefined;

    if (!chatId || !runId) {
      sendStandardError(res, HttpStatus.BAD_REQUEST, "Invalid chat/run ID");
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      return;
    }

    const runRecord = await getRunById(runId);
    if (!runRecord || runRecord.chatId !== chatId || runRecord.userId !== userId) {
      sendStandardError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (isTerminalRunStatus(runRecord.status)) {
      sendSuccess(res, HttpStatus.OK, "Run already in terminal state", {
        cancelled: false,
        reason: "already_terminal",
      });
      return;
    }

    await updateRun(runId, {
      status: RUN_STATUS.CANCELLED,
      state: "CANCELLED",
      completedAt: new Date(),
    });
    await redis.publish(
      `${RUN_CANCEL_CHANNEL_PREFIX}${runId}`,
      JSON.stringify({ cancelled: true }),
    );

    logger.info({ runId, chatId, userId }, "Run cancelled by user");
    sendSuccess(res, HttpStatus.OK, "Run cancelled", { cancelled: true });
  } catch (error) {
    logger.error(ensureError(error), "cancelRunHandler error");
    if (!res.headersSent) {
      sendStandardError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

export async function streamRunEvents(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);
    const runId =
      typeof req.params.runId === "string" ? req.params.runId : undefined;

    if (!chatId || !runId) {
      sendStandardError(res, HttpStatus.BAD_REQUEST, "Invalid chat/run ID");
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      return;
    }

    const runRecord = await getRunById(runId);
    if (!runRecord || runRecord.chatId !== chatId || runRecord.userId !== userId) {
      sendStandardError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    await streamRunEventsFromPersistence({
      req,
      res,
      runId,
    });
  } catch (error) {
    logger.error(ensureError(error), "streamRunEvents error");
    if (!res.headersSent) {
      sendStandardError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
      return;
    }

    if (!res.writableEnded) {
      sendSSEDone(res);
    }
  }
}
