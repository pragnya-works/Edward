import type { Response } from "express";
import { ParserEventType } from "@edward/shared/streamEvents";
import { subscribeToRedisChannel } from "../../../lib/redisPubSub.js";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import {
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
  getBuildBootstrapEventsUseCase,
  getBuildStatusUseCase,
  parseBuildStreamPayload,
} from "../../../services/chat/query/build.useCase.js";
import { toChatRequestContext } from "../../../services/chat/query/requestContext.js";
import { sendQueryErrorResponse } from "./queryErrorResponse.js";
import { requireAuthorizedChatRequest } from "./chatRequestAccess.js";
import {
  configureSSEBackpressure,
  sendSSEComment,
  sendSSEDone,
  sendSSEEvent,
} from "../../../services/sse-utils/service.js";

export async function getBuildStatus(
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
    const build = await getBuildStatusUseCase(context);

    sendSuccess(res, 200, "Build status retrieved successfully", {
      chatId: context.chatId,
      build,
    });
  } catch (error) {
    logger.error(ensureError(error), "getBuildStatus error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
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
    if (closed) {
      return;
    }
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
    const request = await requireAuthorizedChatRequest({
      req,
      res,
      sendError: sendStandardError,
    });
    if (!request) {
      await closeStream();
      return;
    }

    const context = toChatRequestContext(request);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    sseStarted = true;

    configureSSEBackpressure(res, {
      maxQueueBytes: MAX_SSE_QUEUE_BYTES,
      maxQueueEvents: MAX_SSE_QUEUE_EVENTS,
    });

    const channel = `edward:build-status:${context.chatId}`;

    const bootstrapEvents = await getBuildBootstrapEventsUseCase(context);
    for (const event of bootstrapEvents) {
      sendSSEEvent(res, event);
    }

    const onMessage = (payload: string) => {
      try {
        const result = parseBuildStreamPayload({ payload, context });
        for (const event of result.events) {
          sendSSEEvent(res, event);
        }

        if (result.terminal) {
          void closeStream();
        }
      } catch (error) {
        logger.warn(
          { error: ensureError(error), chatId: context.chatId, payload },
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
      sendQueryErrorResponse({
        res,
        error,
        sendError: sendStandardError,
      });
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
