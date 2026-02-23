import type { Request, Response } from "express";
import {
  attachment,
  chat,
  db,
  eq,
  inArray,
  message,
} from "@edward/auth";
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
import {
  assertChatOwnedOrRespond,
  getChatIdOrRespond,
} from "../access/chatAccess.service.js";
import { sendStreamError } from "../response/streamErrors.js";

type SharedMessage = {
  id: string;
  chatId: string;
  role: string;
  content: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
};

async function loadMessagesWithAttachments(chatId: string): Promise<SharedMessage[]> {
  const messages = await db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(message.createdAt);

  const messageIds = messages.map((msg) => msg.id);
  const attachmentsByMessage: Record<string, (typeof attachment.$inferSelect)[]> =
    {};

  if (messageIds.length > 0) {
    const attachments = await db
      .select()
      .from(attachment)
      .where(inArray(attachment.messageId, messageIds));

    for (const msgId of messageIds) {
      attachmentsByMessage[msgId] = [];
    }

    for (const file of attachments) {
      attachmentsByMessage[file.messageId]?.push(file);
    }
  }

  return messages.map((msg) => ({
    ...msg,
    attachments: (attachmentsByMessage[msg.id] || []).map((file) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      type: file.type,
    })),
  }));
}

export async function getShareStatus(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStreamError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStreamError,
    );
    if (!hasAccess) {
      return;
    }

    const [chatRecord] = await db
      .select({ id: chat.id, visibility: chat.visibility })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatRecord) {
      sendStreamError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    sendSuccess(res, HttpStatus.OK, "Share status retrieved successfully", {
      chatId,
      enabled: Boolean(chatRecord.visibility),
      sharePath: `/share/chats/${chatId}/history`,
    });
  } catch (error) {
    logger.error(ensureError(error), "getShareStatus error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function updateShareSettings(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStreamError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStreamError,
    );
    if (!hasAccess) {
      return;
    }

    const enabled =
      typeof req.body?.enabled === "boolean" ? req.body.enabled : false;

    await db
      .update(chat)
      .set({
        visibility: enabled,
        updatedAt: new Date(),
      })
      .where(eq(chat.id, chatId));

    sendSuccess(
      res,
      HttpStatus.OK,
      enabled
        ? "Chat sharing enabled successfully"
        : "Chat sharing disabled successfully",
      {
        chatId,
        enabled,
        sharePath: enabled ? `/share/chats/${chatId}/history` : null,
      },
    );
  } catch (error) {
    logger.error(ensureError(error), "updateShareSettings error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function getSharedChatHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const chatId = getChatIdOrRespond(
      req.params.chatId,
      res,
      sendStandardError,
    );
    if (!chatId) {
      return;
    }

    const [chatRecord] = await db
      .select({ id: chat.id, visibility: chat.visibility })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatRecord) {
      sendStandardError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (!chatRecord.visibility) {
      sendStandardError(
        res,
        HttpStatus.FORBIDDEN,
        "This chat is not publicly shared.",
      );
      return;
    }

    const messages = await loadMessagesWithAttachments(chatId);
    sendSuccess(res, HttpStatus.OK, "Shared chat history retrieved successfully", {
      chatId,
      shared: true,
      messages,
    });
  } catch (error) {
    logger.error(ensureError(error), "getSharedChatHistory error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
