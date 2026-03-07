import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import {
  HttpStatus,
} from "../../../utils/constants.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../../../utils/response.js";
import { RecentChatsQuerySchema } from "../../../schemas/chat.schema.js";
import {
  deleteChatUseCase,
  getChatHistoryUseCase,
  getChatMetaUseCase,
  getRecentChatsUseCase,
} from "../../../services/chat/query/history.useCase.js";
import { getDailyChatSuccessSnapshot } from "../../../services/rateLimit/chatDailySuccess.service.js";
import { toChatRequestContext } from "../../../services/chat/query/requestContext.js";
import { sendStreamError } from "../../../utils/streamError.js";
import { requireAuthorizedChatRequest } from "./chatRequestAccess.js";
import { sendQueryErrorResponse } from "./queryErrorResponse.js";

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const request = await requireAuthorizedChatRequest({
      req,
      res,
      sendError: sendStreamError,
    });
    if (!request) {
      return;
    }

    const context = toChatRequestContext(request);
    const messages = await getChatHistoryUseCase(context);

    sendSuccess(res, HttpStatus.OK, "Chat history retrieved successfully", {
      chatId: context.chatId,
      messages,
    });
  } catch (error) {
    logger.error(ensureError(error), "getChatHistory error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStreamError,
    });
  }
}

export async function deleteChat(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const request = await requireAuthorizedChatRequest({
      req,
      res,
      sendError: sendStreamError,
    });
    if (!request) {
      return;
    }

    const context = toChatRequestContext(request);
    await deleteChatUseCase(context);

    sendSuccess(res, HttpStatus.OK, "Chat deleted successfully");
  } catch (error) {
    logger.error(ensureError(error), "deleteChat error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStreamError,
    });
  }
}

export async function getRecentChats(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const parsedQuery = RecentChatsQuerySchema.safeParse({ query: req.query });
    if (!parsedQuery.success) {
      sendStandardError(
        res,
        HttpStatus.BAD_REQUEST,
        parsedQuery.error.errors[0]?.message ??
          'Query parameter "limit"/"offset" must be non-negative integers',
      );
      return;
    }

    const { limit, offset } = parsedQuery.data.query;
    const { chats, totalCount } = await getRecentChatsUseCase({
      userId,
      limit,
      offset,
    });

    sendSuccess(
      res,
      HttpStatus.OK,
      "Recent chats retrieved successfully",
      chats,
      { total: totalCount, limit, offset },
    );
  } catch (error) {
    logger.error(ensureError(error), "getRecentChats error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
  }
}

export async function getDailyChatQuota(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const snapshot = await getDailyChatSuccessSnapshot(userId);

    sendSuccess(
      res,
      HttpStatus.OK,
      "Daily chat quota retrieved successfully",
      snapshot,
    );
  } catch (error) {
    logger.error(ensureError(error), "getDailyChatQuota error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
  }
}

export async function getChatMeta(
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
    const meta = await getChatMetaUseCase(context);

    sendSuccess(res, HttpStatus.OK, "Chat metadata retrieved successfully", {
      chatId: context.chatId,
      title: meta.title,
      description: meta.description,
      seoTitle: meta.seoTitle,
      seoDescription: meta.seoDescription,
      updatedAt: meta.updatedAt,
    });
  } catch (error) {
    logger.error(ensureError(error), "getChatMeta error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
  }
}
