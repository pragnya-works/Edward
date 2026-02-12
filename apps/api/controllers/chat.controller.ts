import type { Response } from "express";
import { db, chat, message, eq, MessageRole } from "@edward/auth";
import {
  type AuthenticatedRequest,
  getAuthenticatedUserId,
} from "../middleware/auth.js";
import {
  ChatIdParamSchema,
  UnifiedSendMessageSchema,
  ParserEventType,
} from "../schemas/chat.schema.js";
import { nanoid } from "nanoid";
import { logger } from "../utils/logger.js";
import { getDecryptedApiKey } from "../services/apiKey.service.js";
import { HttpStatus, ERROR_MESSAGES } from "../utils/constants.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../utils/response.js";
import { ensureError } from "../utils/error.js";
import { deleteFolder } from "../services/storage.service.js";
import { getOrCreateChat, saveMessage } from "../services/chat.service.js";
import {
  createWorkflow,
  advanceWorkflow,
  ensureSandbox,
} from "../services/planning/workflowEngine.js";
import {
  acquireUserSlot,
  releaseUserSlot,
} from "../services/concurrency.service.js";
import { runStreamSession } from "./chat/streamSession.js";
import {
  getActiveSandbox,
  provisionSandbox,
} from "../services/sandbox/lifecycle/provisioning.js";
import { cleanupSandbox } from "../services/sandbox/lifecycle/cleanup.js";
import { buildS3Key } from "../services/storage/key.utils.js";
import { buildConversationMessages } from "../lib/llm/context.js";
import {
  refreshSandboxTTL,
  getChatFramework,
} from "../services/sandbox/state.sandbox.js";
import { ChatAction } from "../services/planning/schemas.js";
import type { LlmChatMessage } from "../lib/llm/context.js";

function sendStreamError(
  res: Response,
  status: HttpStatus,
  error: string,
): void {
  if (res.headersSent) {
    if (!res.writableEnded && res.writable) {
      res.write(
        `data: ${JSON.stringify({ type: ParserEventType.ERROR, message: error })}\n\n`,
      );
    }
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  sendStandardError(res, status, error);
}

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  let slotAcquired = false;
  let userId: string = "";

  try {
    userId = getAuthenticatedUserId(req);
    const validated = UnifiedSendMessageSchema.safeParse(req.body);

    if (!validated.success) {
      sendStreamError(
        res,
        HttpStatus.BAD_REQUEST,
        validated.error.errors[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR,
      );
      return;
    }

    slotAcquired = await acquireUserSlot(userId);
    if (!slotAcquired) {
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        "Too many concurrent requests. Please wait and try again.",
      );
      return;
    }

    const body = validated.data;

    let decryptedApiKey: string;
    try {
      decryptedApiKey = await getDecryptedApiKey(userId);
    } catch (err) {
      const error = ensureError(err);
      if (error.message === "API key not found") {
        sendStreamError(
          res,
          HttpStatus.BAD_REQUEST,
          "No API key found. Please configure your settings.",
        );
      } else {
        logger.error(error, "Failed to decrypt API key");
        sendStreamError(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Error processing API key. Please re-save it in settings.",
        );
      }
      return;
    }

    const chatResult = await getOrCreateChat(userId, body.chatId, {
      title: body.title,
      description: body.description,
      visibility: body.visibility,
    });

    if (chatResult.error) {
      sendStreamError(
        res,
        chatResult.status || HttpStatus.INTERNAL_SERVER_ERROR,
        chatResult.error,
      );
      return;
    }

    const { chatId, isNewChat } = chatResult;

    const isFollowUp = !isNewChat;
    let intent: (typeof ChatAction)[keyof typeof ChatAction] | undefined =
      isNewChat ? ChatAction.GENERATE : undefined;

    const userMessageId = await saveMessage(
      chatId,
      userId,
      MessageRole.User,
      body.content,
    );
    const assistantMessageId = nanoid(32);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(
      `data: ${JSON.stringify({
        type: ParserEventType.META,
        chatId,
        userMessageId,
        assistantMessageId,
        isNewChat,
        intent,
      })}\n\n`,
    );

    const workflow = await createWorkflow(userId, chatId, {
      userRequest: body.content,
      mode: intent,
    });

    let historyMessages: LlmChatMessage[] = [];
    let projectContext: string = "";
    if (isFollowUp) {
      try {
        await ensureSandbox(workflow, undefined, true);
      } catch (err) {
        logger.warn(
          { err: ensureError(err), chatId },
          "Early sandbox provisioning for context failed, will retry during stream",
        );
      }
      const ctx = await buildConversationMessages(chatId);
      historyMessages = ctx.history;
      projectContext = ctx.projectContext;
    }

    await advanceWorkflow(workflow, body.content);

    if (!intent && workflow.context.intent?.action) {
      intent = workflow.context.intent.action;
    }

    const preVerifiedDeps = workflow.context.intent?.recommendedPackages || [];

    await runStreamSession({
      req,
      res,
      workflow,
      userId,
      chatId,
      decryptedApiKey,
      userContent: body.content,
      userMessageId,
      assistantMessageId,
      preVerifiedDeps,
      isFollowUp,
      intent,
      historyMessages,
      projectContext,
    });
  } catch (error) {
    logger.error(ensureError(error), "unifiedSendMessage error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  } finally {
    if (slotAcquired && userId) {
      await releaseUserSlot(userId).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Failed to release user slot for ${userId}`,
        ),
      );
    }
  }
}

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const validated = ChatIdParamSchema.safeParse(req.params);

    if (!validated.success) {
      sendStreamError(
        res,
        HttpStatus.BAD_REQUEST,
        validated.error.errors[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR,
      );
      return;
    }

    const { chatId } = validated.data;

    const [[chatData], messages] = await Promise.all([
      db
        .select({ userId: chat.userId, visibility: chat.visibility })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1),
      db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(message.createdAt),
    ]);

    if (!chatData) {
      sendStreamError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (chatData.userId !== userId && !chatData.visibility) {
      sendStreamError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    sendSuccess(res, HttpStatus.OK, "Chat history retrieved successfully", {
      chatId,
      messages,
    });

    void (async () => {
      try {
        const existingId = await getActiveSandbox(chatId);
        if (existingId) {
          await refreshSandboxTTL(existingId, chatId);
          return;
        }
        const { hasBackup } =
          await import("../services/sandbox/backup.sandbox.js");
        const backupExists = await hasBackup(chatId);
        const cachedFramework = (await getChatFramework(chatId)) || undefined;
        await provisionSandbox(
          chatData.userId,
          chatId,
          cachedFramework,
          backupExists,
        );
      } catch (err) {
        logger.error({ err, chatId }, "Background sandbox restoration failed");
      }
    })();
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
    const validated = ChatIdParamSchema.safeParse(req.params);

    if (!validated.success) {
      sendStreamError(
        res,
        HttpStatus.BAD_REQUEST,
        validated.error.errors[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR,
      );
      return;
    }

    const { chatId } = validated.data;

    const [chatData] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatData) {
      sendStreamError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (chatData.userId !== userId) {
      sendStreamError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
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
