import type { Response } from "express";
import { ParserEventType } from "@edward/shared/streamEvents";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { getLatestBuildByChatId } from "@edward/auth";
import { subscribeToRedisChannel } from "../../../lib/redisPubSub.js";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import {
  ERROR_MESSAGES,
  HttpStatus,
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
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
import {
  configureSSEBackpressure,
  sendSSEComment,
  sendSSEDone,
  sendSSEEvent,
} from "../sse.utils.js";

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

export async function streamBuildEvents(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  let unsubscribeRedisChannel: (() => Promise<void>) | null = null;
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

    if (unsubscribeRedisChannel) {
      await unsubscribeRedisChannel().catch(() => {});
      unsubscribeRedisChannel = null;
    }

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

    const onMessage = (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as {
          buildId?: string;
          runId?: string;
          status?: BuildRecordStatus;
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

        if (
          parsed.status === BuildRecordStatus.SUCCESS ||
          parsed.status === BuildRecordStatus.FAILED
        ) {
          void closeStream();
        }
      } catch (err) {
        logger.warn(
          { err: ensureError(err), chatId, payload },
          "Failed to parse build SSE payload",
        );
      }
    };

    unsubscribeRedisChannel = await subscribeToRedisChannel(channel, onMessage);

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
    await closeStream();
  }
}
