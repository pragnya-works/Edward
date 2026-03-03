import {
  getRunById,
  isTerminalRunStatus,
  RUN_STATUS,
  updateRun,
} from "@edward/auth";
import {
  MetaPhase,
  ParserEventType,
  STREAM_EVENT_VERSION,
  StreamTerminationReason,
  type StreamEvent,
} from "@edward/shared/streamEvents";
import { classifyAssistantError } from "../../../lib/llm/errorPresentation.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import type { AgentRunMetadata } from "../runMetadata.js";
import {
  mapTerminationToStatus,
  persistRunEventWithLog,
  updateRunWithLog,
} from "./processor.helpers.js";

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

interface RunRecordForFinalize {
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export async function finalizeSuccessfulRun(params: {
  runId: string;
  run: RunRecordForFinalize;
  metadata: AgentRunMetadata;
  currentTurn: number;
  latestLoopStopReason: string | null;
  latestTerminationReason: StreamTerminationReason | null;
  latestErrorMessage: string | null;
  firstTokenLatencyMs: number | null;
  startedAtMs: number;
}): Promise<void> {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - params.startedAtMs);
  const mapped = mapTerminationToStatus(params.latestTerminationReason);

  const latestBeforeFinalize = await getRunById(params.runId).catch(() => null);
  if (!latestBeforeFinalize || isTerminalRunStatus(latestBeforeFinalize.status)) {
    return;
  }

  await updateRun(params.runId, {
    status: mapped.status,
    state: mapped.state,
    currentTurn: params.currentTurn,
    loopStopReason: params.latestLoopStopReason,
    terminationReason: params.latestTerminationReason,
    errorMessage: params.latestErrorMessage,
    completedAt: finishedAt,
    metadata: {
      ...params.metadata,
      resumeCheckpoint: null,
      firstTokenLatencyMs: params.firstTokenLatencyMs,
      runDurationMs: durationMs,
    },
  });

  logger.info(
    {
      runId: params.runId,
      status: mapped.status,
      terminationReason: params.latestTerminationReason,
      loopStopReason: params.latestLoopStopReason,
      traceId: params.metadata.traceId,
      firstTokenLatencyMs: params.firstTokenLatencyMs,
      durationMs,
      metric: "run_completion",
    },
    "Agent run completed",
  );
}

export async function finalizeFailedRun(params: {
  runId: string;
  run: RunRecordForFinalize;
  metadata: AgentRunMetadata;
  currentTurn: number;
  publisher: Publisher;
  flushCapturedEvents: () => Promise<void>;
  error: unknown;
}): Promise<void> {
  const err = ensureError(params.error);
  const assistantError = classifyAssistantError(err.message);
  const latestErrorMessage = assistantError.message;

  const latestBeforeErrorFinalize = await getRunById(params.runId).catch(() => null);
  if (
    latestBeforeErrorFinalize &&
    isTerminalRunStatus(latestBeforeErrorFinalize.status)
  ) {
    return;
  }

  await params.flushCapturedEvents().catch((flushError) => {
    logger.error(
      { error: ensureError(flushError), runId: params.runId },
      "Failed to drain pending run events before terminal persistence",
    );
  });

  const completionMetaEvent: StreamEvent = {
    type: ParserEventType.META,
    version: STREAM_EVENT_VERSION,
    chatId: params.run.chatId,
    userMessageId: params.run.userMessageId,
    assistantMessageId: params.run.assistantMessageId,
    isNewChat: !params.metadata.isFollowUp,
    runId: params.runId,
    phase: MetaPhase.SESSION_COMPLETE,
    terminationReason: StreamTerminationReason.STREAM_FAILED,
  };

  const errorEvent: StreamEvent = {
    type: ParserEventType.ERROR,
    version: STREAM_EVENT_VERSION,
    message: assistantError.message,
    code: assistantError.code,
    details: {
      title: assistantError.title,
      severity: assistantError.severity,
      action: assistantError.action,
      actionLabel: assistantError.actionLabel,
      actionUrl: assistantError.actionUrl,
    },
  };

  await persistRunEventWithLog(
    params.runId,
    errorEvent,
    params.publisher,
    "stream-failure-error-event",
  );
  await persistRunEventWithLog(
    params.runId,
    completionMetaEvent,
    params.publisher,
    "stream-failure-completion-event",
  );

  const terminalFailurePersisted = await updateRunWithLog(
    params.runId,
    {
      status: RUN_STATUS.FAILED,
      state: "FAILED",
      currentTurn: params.currentTurn,
      terminationReason: StreamTerminationReason.STREAM_FAILED,
      errorMessage: latestErrorMessage,
      completedAt: new Date(),
    },
    "stream-failure-terminal-update",
  );

  if (!terminalFailurePersisted) {
    throw params.error;
  }
}
