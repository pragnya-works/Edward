import type { Response } from "express";
import {
  attachment,
  chat,
  count,
  db,
  desc,
  eq,
  inArray,
  message,
} from "@edward/auth";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import { getActiveSandbox } from "../../../services/sandbox/lifecycle/provisioning.js";
import { cleanupSandbox } from "../../../services/sandbox/lifecycle/cleanup.js";
import { buildS3Key } from "../../../services/storage/key.utils.js";
import { deleteFolder } from "../../../services/storage.service.js";
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
import { RecentChatsQuerySchema } from "../../../schemas/chat.schema.js";
import {
  assertChatOwnedOrRespond,
  assertChatReadableOrRespond,
  getChatIdOrRespond,
} from "../access/chatAccess.service.js";
import { sendStreamError } from "../response/streamErrors.js";

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStreamError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatReadableOrRespond(
      chatId,
      userId,
      res,
      sendStreamError,
    );
    if (!hasAccess) {
      return;
    }

    const messages = await db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(message.createdAt);

    const messageIds = messages.map((msg) => msg.id);
    const attachmentsByMessage: Record<
      string,
      (typeof attachment.$inferSelect)[]
    > = {};

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

    const messagesWithAttachments = messages.map((msg) => ({
      ...msg,
      attachments: (attachmentsByMessage[msg.id] || []).map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        type: file.type,
      })),
    }));

    sendSuccess(res, HttpStatus.OK, "Chat history retrieved successfully", {
      chatId,
      messages: messagesWithAttachments,
    });
  } catch (error) {
    logger.error(ensureError(error), "getChatHistory error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function deleteChat(
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

    const activeSandboxId = await getActiveSandbox(chatId);
    if (activeSandboxId) {
      await cleanupSandbox(activeSandboxId).catch((err) =>
        logger.error(
          { err, chatId },
          "Failed to cleanup sandbox during chat deletion",
        ),
      );
    }

    const s3Prefix = buildS3Key(userId, chatId);
    await deleteFolder(s3Prefix).catch((err: unknown) =>
      logger.error(
        { err, chatId, s3Prefix },
        "Failed to cleanup S3 storage during chat deletion",
      ),
    );

    await db.delete(chat).where(eq(chat.id, chatId));

    sendSuccess(res, HttpStatus.OK, "Chat deleted successfully");
  } catch (error) {
    logger.error(ensureError(error), "deleteChat error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
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

    const chats = await db
      .select()
      .from(chat)
      .where(eq(chat.userId, userId))
      .orderBy(desc(chat.updatedAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: count() })
      .from(chat)
      .where(eq(chat.userId, userId));

    const totalCount = Number(countResult?.count ?? 0);

    sendSuccess(
      res,
      HttpStatus.OK,
      "Recent chats retrieved successfully",
      chats,
      { total: totalCount, limit, offset },
    );
  } catch (error) {
    logger.error(ensureError(error), "getRecentChats error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
