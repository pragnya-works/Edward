import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import {
  HttpStatus,
} from "../../../utils/constants.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../../../utils/response.js";
import {
  cancelRunUseCase,
  getActiveRunUseCase,
  getOwnedRunRecordUseCase,
} from "../../../services/chat/query/run.useCase.js";
import {
  toChatRequestContext,
  toRunRequestContext,
} from "../../../services/chat/query/requestContext.js";
import type { RunRequestContext } from "../../../services/chat/query/requestContext.js";
import { sendQueryErrorResponse } from "./queryErrorResponse.js";
import { requireAuthorizedChatRequest } from "./chatRequestAccess.js";
import { sendSSEDone } from "../../../services/sse-utils/service.js";
import { streamRunEventsFromPersistence } from "../../../services/run-event-stream-utils/service.js";

export async function getActiveRun(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const request = await requireAuthorizedChatRequest({
      req,
      res,
      sendError: sendStandardError,
    });
    if (!request) {
      return;
    }

    const context = toChatRequestContext(request);
    const activeRun = await getActiveRunUseCase(context);

    sendSuccess(res, HttpStatus.OK, "Active run retrieved successfully", {
      chatId: context.chatId,
      run: activeRun,
    });
  } catch (error) {
    logger.error(ensureError(error), "getActiveRun error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
  }
}

export async function cancelRunHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveOwnedRunContext(req, res);
    if (!context) {
      return;
    }

    const result = await cancelRunUseCase(context);

    sendSuccess(res, HttpStatus.OK, result.message, result.data);
  } catch (error) {
    logger.error(ensureError(error), "cancelRunHandler error");
    if (!res.headersSent) {
      sendQueryErrorResponse({
        res,
        error,
        sendError: sendStandardError,
      });
    }
  }
}

export async function streamRunEvents(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveOwnedRunContext(req, res);
    if (!context) {
      return;
    }

    await getOwnedRunRecordUseCase(context);

    await streamRunEventsFromPersistence({
      req,
      res,
      runId: context.runId,
    });
  } catch (error) {
    logger.error(ensureError(error), "streamRunEvents error");
    if (!res.headersSent) {
      sendQueryErrorResponse({
        res,
        error,
        sendError: sendStandardError,
      });
      return;
    }

    if (!res.writableEnded) {
      sendSSEDone(res);
    }
  }
}

function getRunIdOrRespond(
  req: AuthenticatedRequest,
  res: Response,
): string | null {
  const runId = typeof req.params.runId === "string" ? req.params.runId : undefined;
  if (runId) {
    return runId;
  }

  sendStandardError(res, HttpStatus.BAD_REQUEST, "Invalid chat/run ID");
  return null;
}

async function resolveOwnedRunContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<RunRequestContext | null> {
  const request = await requireAuthorizedChatRequest({
    req,
    res,
    sendError: sendStandardError,
  });
  if (!request) {
    return null;
  }

  const runId = getRunIdOrRespond(req, res);
  if (!runId) {
    return null;
  }

  return toRunRequestContext({
    context: toChatRequestContext(request),
    runId,
  });
}
