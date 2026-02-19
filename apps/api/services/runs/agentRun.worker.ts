import { EventEmitter } from "node:events";
import {
  ParserEventType,
  MetaPhase,
  STREAM_EVENT_VERSION,
  StreamTerminationReason,
  type StreamEvent,
} from "@edward/shared/stream-events";
import {
  getLatestSessionCompleteEvent,
  getRunById,
  updateRun,
} from "@edward/auth";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getUserWithApiKey } from "../apiKey.service.js";
import { decrypt } from "../../utils/encryption.js";
import { logger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import { runStreamSession } from "../../controllers/chat/streamSession.js";
import {
  parseAgentRunMetadata,
  type AgentRunMetadata,
  type RunResumeCheckpoint,
} from "./runMetadata.js";
import { persistRunEvent } from "./runEvents.service.js";

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

class RunEventCaptureResponse extends EventEmitter {
  public writable = true;
  public writableEnded = false;
  private sseBuffer = "";
  private pending = Promise.resolve();
  private persistFailure: Error | null = null;

  constructor(
    private readonly onEvent: (event: StreamEvent) => Promise<void>,
  ) {
    super();
  }

  setHeader(): void {
    // No-op for worker-captured streams.
  }

  write(chunk: string | Buffer): boolean {
    if (this.writableEnded || !this.writable) {
      return false;
    }

    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.sseBuffer += text;

    const normalized = this.sseBuffer.replaceAll("\r\n", "\n");
    const frames = normalized.split("\n\n");
    this.sseBuffer = frames.pop() ?? "";

    for (const frame of frames) {
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!payload || payload === "[DONE]") {
        continue;
      }

      if (this.persistFailure) {
        continue;
      }

      this.pending = this.pending.then(async () => {
        try {
          const parsed = JSON.parse(payload) as StreamEvent;
          await this.onEvent(parsed);
        } catch (error) {
          const err = ensureError(error);
          this.persistFailure = err;
          logger.error(
            { error: err, payload },
            "Failed to persist captured run event",
          );
        }
      });
    }

    return true;
  }

  end(): void {
    if (this.writableEnded) return;
    this.writable = false;
    this.writableEnded = true;
    this.emit("finish");
    this.emit("close");
  }

  async flushPending(): Promise<void> {
    await this.pending;
    if (this.persistFailure) {
      throw this.persistFailure;
    }
  }
}

function mapTerminationToStatus(
  terminationReason: StreamTerminationReason | null,
): {
  status: "completed" | "failed" | "cancelled";
  state: "COMPLETE" | "FAILED" | "CANCELLED";
} {
  if (!terminationReason) {
    return { status: "failed", state: "FAILED" };
  }

  if (terminationReason === StreamTerminationReason.CLIENT_DISCONNECT) {
    return { status: "cancelled", state: "CANCELLED" };
  }

  if (
    terminationReason === StreamTerminationReason.STREAM_FAILED ||
    terminationReason === StreamTerminationReason.ABORTED ||
    terminationReason === StreamTerminationReason.STREAM_TIMEOUT ||
    terminationReason === StreamTerminationReason.SLOW_CLIENT
  ) {
    return { status: "failed", state: "FAILED" };
  }

  return { status: "completed", state: "COMPLETE" };
}

function readTerminationFromTerminalEvent(
  event: StreamEvent,
): StreamTerminationReason | null {
  if (event.type !== ParserEventType.META) {
    return null;
  }

  if (event.phase !== MetaPhase.SESSION_COMPLETE) {
    return null;
  }

  return event.terminationReason ?? null;
}

export async function processAgentRunJob(
  runId: string,
  publisher: Publisher,
): Promise<void> {
  const run = await getRunById(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return;
  }

  const terminalEvent = await getLatestSessionCompleteEvent(runId);
  if (terminalEvent) {
    const terminationReason = readTerminationFromTerminalEvent(
      terminalEvent.event as StreamEvent,
    );
    const mapped = mapTerminationToStatus(terminationReason);
    await updateRun(runId, {
      status: mapped.status,
      state: mapped.state,
      terminationReason,
      completedAt: run.completedAt ?? new Date(),
    }).catch(() => {});
    return;
  }

  let metadata: AgentRunMetadata;
  try {
    metadata = parseAgentRunMetadata(run.metadata);
  } catch (error) {
    const err = ensureError(error);
    await updateRun(runId, {
      status: "failed",
      state: "FAILED",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
    throw err;
  }

  const userData = await getUserWithApiKey(run.userId);
  if (!userData?.apiKey) {
    const err = new Error("Missing API key for run execution");
    await updateRun(runId, {
      status: "failed",
      state: "FAILED",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
    throw err;
  }

  let decryptedApiKey: string;
  try {
    decryptedApiKey = decrypt(userData.apiKey);
  } catch (error) {
    const err = ensureError(error);
    await updateRun(runId, {
      status: "failed",
      state: "FAILED",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
    throw err;
  }
  const startedAt = run.startedAt ?? new Date();
  const startedAtMs = startedAt.getTime();
  let firstTokenLatencyMs: number | null = null;
  let latestLoopStopReason: string | null = null;
  let latestTerminationReason: StreamTerminationReason | null = null;
  let latestErrorMessage: string | null = null;
  let currentTurn = metadata.resumeCheckpoint?.turn ?? run.currentTurn ?? 0;
  const turnStartTimes = new Map<number, number>();

  await updateRun(runId, {
    status: "running",
    state: "INIT",
    startedAt,
    errorMessage: null,
  });
  let lastPersistedState:
    | "INIT"
    | "LLM_STREAM"
    | "TOOL_EXEC"
    | "APPLY"
    | "NEXT_TURN" = "INIT";
  let lastPersistedTurn = currentTurn;

  const updateRunStateIfNeeded = async (
    nextState:
      | "INIT"
      | "LLM_STREAM"
      | "TOOL_EXEC"
      | "APPLY"
      | "NEXT_TURN",
    nextTurn: number,
  ) => {
    if (lastPersistedState === nextState && lastPersistedTurn === nextTurn) {
      return;
    }

    await updateRun(runId, { state: nextState, currentTurn: nextTurn });
    lastPersistedState = nextState;
    lastPersistedTurn = nextTurn;
  };

  const capturedRes = new RunEventCaptureResponse(async (event) => {
    await persistRunEvent(runId, event, publisher);

    if (firstTokenLatencyMs === null && event.type === ParserEventType.TEXT) {
      firstTokenLatencyMs = Math.max(0, Date.now() - startedAtMs);
    }

    if (
      event.type === ParserEventType.COMMAND ||
      event.type === ParserEventType.WEB_SEARCH
    ) {
      await updateRunStateIfNeeded("TOOL_EXEC", currentTurn);
      return;
    }

    if (
      event.type === ParserEventType.FILE_START ||
      event.type === ParserEventType.FILE_CONTENT ||
      event.type === ParserEventType.FILE_END ||
      event.type === ParserEventType.SANDBOX_START ||
      event.type === ParserEventType.SANDBOX_END ||
      event.type === ParserEventType.INSTALL_START ||
      event.type === ParserEventType.INSTALL_CONTENT ||
      event.type === ParserEventType.INSTALL_END
    ) {
      await updateRunStateIfNeeded("APPLY", currentTurn);
      return;
    }

    if (event.type === ParserEventType.ERROR) {
      latestErrorMessage = event.message;
      return;
    }

    if (event.type !== ParserEventType.META) {
      return;
    }

    if (typeof event.turn === "number" && event.turn > 0) {
      currentTurn = event.turn;
    }

    if (event.phase === MetaPhase.TURN_START) {
      turnStartTimes.set(currentTurn, Date.now());
      await updateRunStateIfNeeded("LLM_STREAM", currentTurn);
      return;
    }

    if (event.phase === MetaPhase.TURN_COMPLETE) {
      const startedTurnAt = turnStartTimes.get(currentTurn);
      if (typeof startedTurnAt === "number") {
        logger.info(
          {
            runId,
            turn: currentTurn,
            turnLatencyMs: Math.max(0, Date.now() - startedTurnAt),
            metric: "turn_latency",
          },
          "Run turn completed",
        );
      }
      turnStartTimes.delete(currentTurn);

      await updateRunStateIfNeeded("NEXT_TURN", currentTurn);
      return;
    }

    if (event.phase === MetaPhase.SESSION_COMPLETE) {
      latestLoopStopReason = event.loopStopReason ?? null;
      latestTerminationReason = event.terminationReason ?? null;
    }
  });

  const fakeReq = new EventEmitter() as unknown as AuthenticatedRequest;

  try {
    await runStreamSession({
      req: fakeReq,
      res: capturedRes as never,
      workflow: metadata.workflow,
      userId: run.userId,
      chatId: run.chatId,
      decryptedApiKey,
      userContent: metadata.userContent,
      userTextContent: metadata.userTextContent,
      userMessageId: run.userMessageId,
      assistantMessageId: run.assistantMessageId,
      preVerifiedDeps: metadata.preVerifiedDeps,
      isFollowUp: metadata.isFollowUp,
      intent: metadata.intent,
      historyMessages: metadata.historyMessages,
      projectContext: metadata.projectContext,
      model: metadata.model,
      runId,
      resumeCheckpoint: metadata.resumeCheckpoint
        ? {
            turn: metadata.resumeCheckpoint.turn,
            fullRawResponse: metadata.resumeCheckpoint.fullRawResponse,
            agentMessages: metadata.resumeCheckpoint.agentMessages,
            sandboxTagDetected: metadata.resumeCheckpoint.sandboxTagDetected,
            totalToolCallsInRun: metadata.resumeCheckpoint.totalToolCallsInRun,
          }
        : undefined,
      onCheckpoint: async (checkpoint) => {
        const mergedMetadata: AgentRunMetadata = {
          ...metadata,
          resumeCheckpoint: {
            turn: checkpoint.turn,
            fullRawResponse: checkpoint.fullRawResponse,
            agentMessages: checkpoint.agentMessages,
            sandboxTagDetected: checkpoint.sandboxTagDetected,
            totalToolCallsInRun: checkpoint.totalToolCallsInRun,
            updatedAt: checkpoint.updatedAt,
          } satisfies RunResumeCheckpoint,
        };
        metadata = mergedMetadata;
        await updateRun(runId, {
          currentTurn: checkpoint.turn,
          metadata: mergedMetadata as unknown as Record<string, unknown>,
        });
      },
    });

    await capturedRes.flushPending();

    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAtMs);
    const mapped = mapTerminationToStatus(latestTerminationReason);

    await updateRun(runId, {
      status: mapped.status,
      state: mapped.state,
      currentTurn,
      loopStopReason: latestLoopStopReason,
      terminationReason: latestTerminationReason,
      errorMessage: latestErrorMessage,
      completedAt: finishedAt,
      metadata: {
        ...metadata,
        resumeCheckpoint: null,
        firstTokenLatencyMs,
        runDurationMs: durationMs,
      },
    });

    logger.info(
      {
        runId,
        status: mapped.status,
        terminationReason: latestTerminationReason,
        loopStopReason: latestLoopStopReason,
        firstTokenLatencyMs,
        durationMs,
        metric: "run_completion",
      },
      "Agent run completed",
    );
  } catch (error) {
    const err = ensureError(error);
    latestErrorMessage = err.message;

    await capturedRes.flushPending().catch((flushError) => {
      logger.error(
        { error: ensureError(flushError), runId },
        "Failed to drain pending run events before terminal persistence",
      );
    });

    const completionMetaEvent: StreamEvent = {
      type: ParserEventType.META,
      version: STREAM_EVENT_VERSION,
      chatId: run.chatId,
      userMessageId: run.userMessageId,
      assistantMessageId: run.assistantMessageId,
      isNewChat: !metadata.isFollowUp,
      runId,
      phase: MetaPhase.SESSION_COMPLETE,
      terminationReason: StreamTerminationReason.STREAM_FAILED,
    };

    await persistRunEvent(
      runId,
      {
        type: ParserEventType.ERROR,
        version: STREAM_EVENT_VERSION,
        message: err.message,
        code: "agent_run_failed",
      },
      publisher,
    ).catch(() => {});

    await persistRunEvent(runId, completionMetaEvent, publisher).catch(() => {});

    await updateRun(runId, {
      status: "failed",
      state: "FAILED",
      currentTurn,
      terminationReason: StreamTerminationReason.STREAM_FAILED,
      errorMessage: latestErrorMessage,
      completedAt: new Date(),
    }).catch(() => {});

    throw error;
  }
}
