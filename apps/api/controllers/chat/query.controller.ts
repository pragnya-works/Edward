import type { Response } from "express";
import { ParserEventType } from "@edward/shared/stream-events";
import {
  and,
  attachment,
  chat,
  count,
  db,
  desc,
  eq,
  getLatestBuildByChatId,
  getRunById,
  inArray,
  message,
  run,
} from "@edward/auth";
import { createRedisClient } from "../../lib/redis.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { getActiveSandbox } from "../../services/sandbox/lifecycle/provisioning.js";
import { cleanupSandbox } from "../../services/sandbox/lifecycle/cleanup.js";
import { buildS3Key } from "../../services/storage/key.utils.js";
import { deleteFolder } from "../../services/storage.service.js";
import {
  readAllProjectFiles,
  readProjectFilesFromS3,
} from "../../services/sandbox/read.sandbox.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import {
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
} from "../../utils/sharedConstants.js";
import { sendError as sendStandardError, sendSuccess } from "../../utils/response.js";
import {
  assertChatOwnedOrRespond,
  assertChatReadableOrRespond,
  getChatIdOrRespond,
  sendStreamError,
} from "./shared.utils.js";
import {
  configureSSEBackpressure,
  sendSSEComment,
  sendSSEDone,
  sendSSEEvent,
} from "./sse.utils.js";
import { streamRunEventsFromPersistence } from "./runEventStream.utils.js";
import { RecentChatsQuerySchema } from "../../schemas/chat.schema.js";

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

export async function getBuildStatus(
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

    const latestBuild = await getLatestBuildByChatId(chatId);

    sendSuccess(res, HttpStatus.OK, "Build status retrieved successfully", {
      chatId,
      build: latestBuild
        ? {
            id: latestBuild.id,
            status: latestBuild.status,
            previewUrl: latestBuild.previewUrl,
            buildDuration: latestBuild.buildDuration,
            errorReport: latestBuild.errorReport,
            createdAt: latestBuild.createdAt,
          }
        : null,
    });
  } catch (error) {
    logger.error(ensureError(error), "getBuildStatus error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}

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
          inArray(run.status, ["queued", "running"]),
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

export async function streamBuildEvents(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const redisSub = createRedisClient();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let sseStarted = false;

  const closeStream = async () => {
    if (closed) return;
    closed = true;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    await redisSub.unsubscribe().catch(() => {});
    await redisSub.quit().catch(() => {});

    if (sseStarted && !res.writableEnded) {
      sendSSEDone(res);
    }
  };

  req.on("close", () => {
    void closeStream();
  });

  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);

    if (!chatId) {
      await closeStream();
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      await closeStream();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    sseStarted = true;

    configureSSEBackpressure(res, {
      maxQueueBytes: MAX_SSE_QUEUE_BYTES,
      maxQueueEvents: MAX_SSE_QUEUE_EVENTS,
    });

    const channel = `edward:build-status:${chatId}`;

    const latestBuild = await getLatestBuildByChatId(chatId);
    if (latestBuild) {
      sendSSEEvent(res, {
        type: ParserEventType.BUILD_STATUS,
        chatId,
        status: latestBuild.status,
        buildId: latestBuild.id,
        previewUrl: latestBuild.previewUrl,
        errorReport: latestBuild.errorReport,
      });

      if (latestBuild.previewUrl) {
        sendSSEEvent(res, {
          type: ParserEventType.PREVIEW_URL,
          url: latestBuild.previewUrl,
          chatId,
        });
      }
    }

    const onMessage = (incomingChannel: string, payload: string) => {
      if (incomingChannel !== channel) return;

      try {
        const parsed = JSON.parse(payload) as {
          buildId?: string;
          runId?: string;
          status?: "queued" | "building" | "success" | "failed";
          previewUrl?: string | null;
          errorReport?: unknown;
        };

        if (!parsed.status) {
          return;
        }

        sendSSEEvent(res, {
          type: ParserEventType.BUILD_STATUS,
          chatId,
          status: parsed.status,
          buildId: parsed.buildId,
          runId: parsed.runId,
          previewUrl: parsed.previewUrl,
          errorReport: parsed.errorReport,
        });

        if (parsed.previewUrl) {
          sendSSEEvent(res, {
            type: ParserEventType.PREVIEW_URL,
            url: parsed.previewUrl,
            chatId,
            runId: parsed.runId,
          });
        }

        if (parsed.status === "success" || parsed.status === "failed") {
          void closeStream();
        }
      } catch (err) {
        logger.warn(
          { err: ensureError(err), chatId, payload },
          "Failed to parse build SSE payload",
        );
      }
    };

    redisSub.on("message", onMessage);
    await redisSub.subscribe(channel);

    heartbeat = setInterval(() => {
      sendSSEComment(res, "build-events-heartbeat");
    }, 15_000);

  } catch (error) {
    logger.error(ensureError(error), "streamBuildEvents error");
    if (!res.headersSent) {
      sendStandardError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    } else if (!res.writableEnded) {
      sendSSEEvent(res, {
        type: ParserEventType.ERROR,
        message: "Build event stream failed",
        code: "build_event_stream_failed",
      });
      sendSSEDone(res);
    }
  }
}

export async function getSandboxFiles(
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

    const sandboxId = await getActiveSandbox(chatId);
    let filesMap: Map<string, string>;

    if (!sandboxId) {
      logger.info(
        { chatId, userId },
        "No active sandbox, falling back to S3 for files",
      );
      filesMap = await readProjectFilesFromS3(userId, chatId);
    } else {
      filesMap = await readAllProjectFiles(sandboxId);
    }

    const files = Array.from(filesMap.entries()).map(([path, content]) => ({
      path,
      content,
      isComplete: true,
    }));

    sendSuccess(res, HttpStatus.OK, "Sandbox files retrieved successfully", {
      chatId,
      sandboxId,
      files,
      totalFiles: files.length,
    });
  } catch (error) {
    logger.error(ensureError(error), "getSandboxFiles error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
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

    const run = await getRunById(runId);
    if (!run || run.chatId !== chatId || run.userId !== userId) {
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
