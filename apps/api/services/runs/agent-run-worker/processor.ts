import { type StreamEvent } from "@edward/shared/streamEvents";
import {
  getLatestSessionCompleteEvent,
  getRunById,
  isTerminalRunStatus,
  RUN_STATUS,
  updateRun,
} from "@edward/auth";
import type { Response } from "express";
import { createRedisClient } from "../../../lib/redis.js";
import { getUserWithApiKey } from "../../apiKey.service.js";
import { decrypt } from "../../../utils/encryption.js";
import {
  getRunCancelChannel,
  RUN_TERMINAL_STATUS_POLL_INTERVAL_MS,
} from "../../../utils/constants.js";
import { logger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";
import { runStreamSession } from "../../../services/chat/session/orchestrator/runStreamSession.orchestrator.js";
import {
  buildConversationMessages,
  type LlmChatMessage,
} from "../../../lib/llm/context.js";
import {
  parseAgentRunMetadata,
  type AgentRunMetadata,
} from "../runMetadata.js";
import { persistRunEvent } from "../runEvents.service.js";
import { trackRunEventProgress, type RunEventProgress } from "./processor.events.js";
import { finalizeFailedRun, finalizeSuccessfulRun } from "./processor.finalize.js";
import {
  createRunEventCaptureResponse,
  markRunRunningIfAdmissible,
  mapTerminationToStatus,
  readTerminationFromTerminalEvent,
  type PersistedRunState,
  updateRunWithLog,
} from "./processor.helpers.js";
import {
  buildWorkerRunSessionInput,
  createWorkerRequest,
} from "./processor.session.js";

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

export async function processAgentRunJob(
  runId: string,
  publisher: Publisher,
): Promise<void> {
  const run = await getRunById(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (isTerminalRunStatus(run.status)) {
    return;
  }

  const terminalEvent = await getLatestSessionCompleteEvent(runId);
  if (terminalEvent) {
    const terminationReason = readTerminationFromTerminalEvent(
      terminalEvent.event as StreamEvent,
    );
    const mapped = mapTerminationToStatus(terminationReason);
    await updateRunWithLog(runId, {
      status: mapped.status,
      state: mapped.state,
      terminationReason,
      completedAt: run.completedAt ?? new Date(),
    }, "terminal-event-already-present");
    return;
  }

  const workerAbort = new AbortController();
  const runCancelChannel = getRunCancelChannel(runId);
  const cancelSub = createRedisClient();
  let cancelSubscriptionReady = false;
  let runStatusWatchdog: ReturnType<typeof setInterval> | null = null;
  let runStatusCheckInFlight = false;

  try {
    const abortWhenRunTerminal = async () => {
      if (workerAbort.signal.aborted || runStatusCheckInFlight) {
        return;
      }

      runStatusCheckInFlight = true;
      try {
        const latest = await getRunById(runId);
        if (!latest || isTerminalRunStatus(latest.status)) {
          logger.info(
            {
              runId,
              status: latest?.status ?? "missing_run",
            },
            "Run became terminal while worker was active; aborting run stream",
          );
          workerAbort.abort();
        }
      } catch (error) {
        logger.warn(
          { runId, error: ensureError(error) },
          "Failed to poll run status while worker was active",
        );
      } finally {
        runStatusCheckInFlight = false;
      }
    };

    await cancelSub.subscribe(runCancelChannel);
    cancelSubscriptionReady = true;
    cancelSub.on("message", (channel: string) => {
      if (channel !== runCancelChannel) return;
      logger.info({ runId }, "Cancel signal received via Redis — aborting agent run");
      workerAbort.abort();
    });

    const latestAfterSubscription = await getRunById(runId);
    if (
      !latestAfterSubscription ||
      isTerminalRunStatus(latestAfterSubscription.status)
    ) {
      return;
    }

    runStatusWatchdog = setInterval(() => {
      void abortWhenRunTerminal();
    }, RUN_TERMINAL_STATUS_POLL_INTERVAL_MS);
    runStatusWatchdog.unref();

    let metadata: AgentRunMetadata;
    try {
      metadata = parseAgentRunMetadata(run.metadata);
    } catch (error) {
      const err = ensureError(error);
      await updateRunWithLog(runId, {
        status: RUN_STATUS.FAILED,
        state: "FAILED",
        errorMessage: err.message,
        completedAt: new Date(),
      }, "metadata-parse-failed");
      throw err;
    }

    const userData = await getUserWithApiKey(run.userId);
    if (!userData?.apiKey) {
      const err = new Error("Missing API key for run execution");
      await updateRunWithLog(runId, {
        status: RUN_STATUS.FAILED,
        state: "FAILED",
        errorMessage: err.message,
        completedAt: new Date(),
      }, "api-key-missing");
      throw err;
    }

    let decryptedApiKey: string;
    try {
      decryptedApiKey = decrypt(userData.apiKey);
    } catch (error) {
      const err = ensureError(error);
      await updateRunWithLog(runId, {
        status: RUN_STATUS.FAILED,
        state: "FAILED",
        errorMessage: err.message,
        completedAt: new Date(),
      }, "api-key-decrypt-failed");
      throw err;
    }

    let historyMessages: LlmChatMessage[] = metadata.historyMessages ?? [];
    let projectContext = metadata.projectContext ?? "";

    if (metadata.isFollowUp) {
      try {
        const ctx = await buildConversationMessages(run.chatId, {
          excludeMessageIds: run.userMessageId ? [run.userMessageId] : [],
          maxCreatedAt: run.createdAt ?? undefined,
        });
        historyMessages = ctx.history;
        projectContext = ctx.projectContext;
      } catch (err) {
        logger.warn(
          { err, runId, chatId: run.chatId },
          "Failed to reconstruct follow-up context in worker; falling back to metadata snapshot",
        );
      }
    }

    const startedAt = run.startedAt ?? new Date();
    const startedAtMs = startedAt.getTime();
    const progress: RunEventProgress = {
      currentTurn: metadata.resumeCheckpoint?.turn ?? run.currentTurn ?? 0,
      firstTokenLatencyMs: null,
      latestLoopStopReason: null,
      latestTerminationReason: null,
      latestErrorMessage: null,
      turnStartTimes: new Map<number, number>(),
    };

    const latestBeforeStart = await getRunById(runId);
    if (
      workerAbort.signal.aborted ||
      !latestBeforeStart ||
      isTerminalRunStatus(latestBeforeStart.status)
    ) {
      if (
        workerAbort.signal.aborted &&
        latestBeforeStart &&
        !isTerminalRunStatus(latestBeforeStart.status)
      ) {
        await updateRunWithLog(runId, {
          status: RUN_STATUS.CANCELLED,
          state: "CANCELLED",
          completedAt: new Date(),
        }, "worker-aborted-before-start");
      }
      return;
    }

    const markedRunning = await markRunRunningIfAdmissible(runId, startedAt);
    if (!markedRunning) {
      logger.info(
        { runId },
        "Skipped RUNNING transition because run is no longer in an active startup state",
      );
      return;
    }
    let lastPersistedState: PersistedRunState = "INIT";
    let lastPersistedTurn = progress.currentTurn;

    logger.info(
      {
        runId,
        chatId: run.chatId,
        userId: run.userId,
        traceId: metadata.traceId,
        metric: "run_start",
      },
      "Agent run started",
    );

    const updateRunStateIfNeeded = async (
      nextState: PersistedRunState,
      nextTurn: number,
    ) => {
      if (lastPersistedState === nextState && lastPersistedTurn === nextTurn) {
        return;
      }

      await updateRun(runId, { state: nextState, currentTurn: nextTurn });
      lastPersistedState = nextState;
      lastPersistedTurn = nextTurn;
    };

    const capturedRes = createRunEventCaptureResponse(async (event) => {
      await persistRunEvent(runId, event, publisher);
      await trackRunEventProgress({
        runId,
        event,
        startedAtMs,
        progress,
        updateRunStateIfNeeded,
      });
    });

    const fakeReq = createWorkerRequest(run.userId);

    try {
      await runStreamSession(
        buildWorkerRunSessionInput({
          req: fakeReq,
          res: capturedRes as unknown as Response,
          externalSignal: workerAbort.signal,
          workflow: metadata.workflow,
          run,
          decryptedApiKey,
          getMetadata: () => metadata,
          historyMessages,
          projectContext,
          runId,
          onMetadataUpdated: (nextMetadata) => {
            metadata = nextMetadata;
          },
          onTurnUpdated: (turn) => {
            progress.currentTurn = turn;
          },
        }),
      );

      await capturedRes.flushPending();
      await finalizeSuccessfulRun({
        runId,
        run,
        metadata,
        currentTurn: progress.currentTurn,
        latestLoopStopReason: progress.latestLoopStopReason,
        latestTerminationReason: progress.latestTerminationReason,
        latestErrorMessage: progress.latestErrorMessage,
        firstTokenLatencyMs: progress.firstTokenLatencyMs,
        startedAtMs,
      });
    } catch (error) {
      await finalizeFailedRun({
        runId,
        run,
        metadata,
        currentTurn: progress.currentTurn,
        publisher,
        flushCapturedEvents: () => capturedRes.flushPending(),
        error,
      });
    }
  } finally {
    if (runStatusWatchdog) {
      clearInterval(runStatusWatchdog);
    }
    if (cancelSubscriptionReady) {
      await cancelSub.unsubscribe().catch((error: unknown) => {
        logger.warn(
          { runId, error: ensureError(error) },
          "Failed to unsubscribe cancel channel",
        );
      });
    }
    await cancelSub.quit().catch((error: unknown) => {
      logger.warn(
        { runId, error: ensureError(error) },
        "Failed to quit cancel subscriber client cleanly",
      );
    });
  }
}
