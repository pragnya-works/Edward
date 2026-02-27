import type { Response } from "express";
import { ParserEventType } from "@edward/shared/streamEvents";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import {
  ACTIVE_RUN_STATUSES,
  and,
  createBuild,
  db,
  eq,
  getLatestBuildByChatId,
  inArray,
  run,
  updateBuild,
} from "@edward/auth";
import { acquireDistributedLock, releaseDistributedLock } from "../../../lib/distributedLock.js";
import { subscribeToRedisChannel } from "../../../lib/redisPubSub.js";
import { redis } from "../../../lib/redis.js";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import { enqueueBuildJob } from "../../../services/queue/enqueue.js";
import {
  getActiveSandbox,
  provisionSandbox,
} from "../../../services/sandbox/lifecycle/provisioning.js";
import {
  hasBackup,
  hasBackupOnS3,
} from "../../../services/sandbox/backup.service.js";
import { getChatFramework } from "../../../services/sandbox/state.service.js";
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

export async function triggerRebuild(
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

    const lockKey = `lock:rebuild:${chatId}`;
    const lock = await acquireDistributedLock(lockKey, { ttlMs: 30_000 });
    if (!lock) {
      sendStandardError(
        res,
        HttpStatus.CONFLICT,
        "A rebuild is already in progress for this chat.",
      );
      return;
    }

    try {
    const [activeRun] = await db
      .select({ id: run.id })
      .from(run)
      .where(
        and(
          eq(run.chatId, chatId),
          eq(run.userId, userId),
          inArray(run.status, ACTIVE_RUN_STATUSES),
        ),
      )
      .limit(1);

    if (activeRun) {
      sendStandardError(
        res,
        HttpStatus.CONFLICT,
        "Cannot rebuild while a run is in progress.",
      );
      return;
    }

    const latestBuild = await getLatestBuildByChatId(chatId);
    if (!latestBuild) {
      sendStandardError(
        res,
        HttpStatus.CONFLICT,
        "Rebuild is available only after a completed build.",
      );
      return;
    }

    if (
      latestBuild.status !== BuildRecordStatus.SUCCESS &&
      latestBuild.status !== BuildRecordStatus.FAILED
    ) {
      sendStandardError(
        res,
        HttpStatus.CONFLICT,
        "Rebuild is allowed only after the latest build has succeeded or failed.",
      );
      return;
    }

    let sandboxId = await getActiveSandbox(chatId);
    if (!sandboxId) {
      const cachedFramework = await getChatFramework(chatId);
      let shouldRestoreFromBackup = await hasBackup(chatId);
      if (!shouldRestoreFromBackup) {
        shouldRestoreFromBackup = await hasBackupOnS3(chatId, userId);
      }

      try {
        sandboxId = await provisionSandbox(
          userId,
          chatId,
          cachedFramework ?? undefined,
          shouldRestoreFromBackup,
        );
      } catch (provisionError) {
        if (cachedFramework) {
          logger.warn(
            {
              err: ensureError(provisionError),
              chatId,
              cachedFramework,
              shouldRestoreFromBackup,
            },
            "Sandbox reprovision with cached framework failed; retrying without framework",
          );
          sandboxId = await provisionSandbox(
            userId,
            chatId,
            undefined,
            shouldRestoreFromBackup,
          );
        } else {
          throw provisionError;
        }
      }
    }

    const queuedBuild = await createBuild({
      chatId,
      messageId: latestBuild.messageId,
      status: BuildRecordStatus.QUEUED,
      forceNew: true,
    });
    const runId = `manual-rebuild-${queuedBuild.id}`;
    const buildStatusChannel = `edward:build-status:${chatId}`;

    try {
      await enqueueBuildJob({
        sandboxId,
        userId,
        chatId,
        messageId: latestBuild.messageId,
        buildId: queuedBuild.id,
        runId,
      });
    } catch (queueError) {
      const enqueueErrorReport = {
        failed: true,
        headline: "Failed to enqueue rebuild job",
        details:
          queueError instanceof Error
            ? queueError.message
            : String(queueError),
      };

      await updateBuild(queuedBuild.id, {
        status: BuildRecordStatus.FAILED,
        errorReport: enqueueErrorReport as Record<string, unknown>,
      }).catch(() => {});

      await redis
        .publish(
          buildStatusChannel,
          JSON.stringify({
            buildId: queuedBuild.id,
            runId,
            status: BuildRecordStatus.FAILED,
            errorReport: enqueueErrorReport,
          }),
        )
        .catch(() => {});

      logger.error(
        { err: ensureError(queueError), chatId, buildId: queuedBuild.id },
        "Failed to enqueue manual rebuild",
      );

      sendStandardError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to start rebuild job",
      );
      return;
    }

    await redis
      .publish(
        buildStatusChannel,
        JSON.stringify({
          buildId: queuedBuild.id,
          runId,
          status: BuildRecordStatus.QUEUED,
        }),
      )
      .catch((publishError) => {
        logger.warn(
          { err: ensureError(publishError), chatId, buildId: queuedBuild.id },
          "Failed to publish QUEUED build status notification",
        );
      });

    sendSuccess(res, HttpStatus.OK, "Rebuild started successfully", {
      chatId,
      build: {
        id: queuedBuild.id,
        status: queuedBuild.status,
        previewUrl: queuedBuild.previewUrl,
        buildDuration: queuedBuild.buildDuration,
        errorReport: queuedBuild.errorReport,
        createdAt: queuedBuild.createdAt,
      },
    });
    } finally {
      await releaseDistributedLock(lock).catch(() => {});
    }
  } catch (error) {
    logger.error(ensureError(error), "triggerRebuild error");
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

      if (
        latestBuild.status === BuildRecordStatus.SUCCESS ||
        latestBuild.status === BuildRecordStatus.FAILED
      ) {
        await closeStream();
        return;
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
