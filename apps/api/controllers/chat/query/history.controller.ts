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
  deletePreviewSubdomain,
  generatePreviewSubdomain,
} from "../../../services/previewRouting/registration.js";
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

    const [chatData] = await db
      .select({ customSubdomain: chat.customSubdomain })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    const storagePrefix = buildS3Key(userId, chatId).replace(/\/$/, "");
    const subdomain =
      chatData?.customSubdomain ?? generatePreviewSubdomain(userId, chatId);

    await deletePreviewSubdomain(subdomain, storagePrefix).catch((err) =>
      logger.warn(
        { err, chatId, subdomain, storagePrefix },
        "Failed to cleanup preview routing during chat deletion",
      ),
    );

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
      .select({
        id: chat.id,
        userId: chat.userId,
        title: chat.title,
        description: chat.description,
        visibility: chat.visibility,
        githubRepoFullName: chat.githubRepoFullName,
        customSubdomain: chat.customSubdomain,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      })
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

function isMissingChatSeoColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('column "seo_title" does not exist') ||
    message.includes('column "seo_description" does not exist')
  );
}

export async function getChatMeta(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatReadableOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      return;
    }

    let metaRow:
      | {
          title: string | null;
          description: string | null;
          seoTitle: string | null;
          seoDescription: string | null;
          updatedAt: Date;
        }
      | undefined;

    try {
      [metaRow] = await db
        .select({
          title: chat.title,
          description: chat.description,
          seoTitle: chat.seoTitle,
          seoDescription: chat.seoDescription,
          updatedAt: chat.updatedAt,
        })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);
    } catch (error) {
      if (!isMissingChatSeoColumnError(error)) {
        throw error;
      }

      const [fallbackRow] = await db
        .select({
          title: chat.title,
          description: chat.description,
          updatedAt: chat.updatedAt,
        })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);

      metaRow = fallbackRow
        ? {
            ...fallbackRow,
            seoTitle: fallbackRow.title,
            seoDescription: fallbackRow.description,
          }
        : undefined;
    }

    if (!metaRow) {
      sendStandardError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    sendSuccess(res, HttpStatus.OK, "Chat metadata retrieved successfully", {
      chatId,
      title: metaRow.title,
      description: metaRow.description,
      seoTitle: metaRow.seoTitle ?? metaRow.title,
      seoDescription: metaRow.seoDescription ?? metaRow.description,
      updatedAt: metaRow.updatedAt,
    });
  } catch (error) {
    logger.error(ensureError(error), "getChatMeta error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
