import {
  MetaPhase,
  ParserEventType,
  type StreamEvent,
  type StreamTerminationReason,
} from "@edward/shared/streamEvents";
import { logger } from "../../../utils/logger.js";
import type { PersistedRunState } from "./processor.helpers.js";

export interface RunEventProgress {
  currentTurn: number;
  firstTokenLatencyMs: number | null;
  latestLoopStopReason: string | null;
  latestTerminationReason: StreamTerminationReason | null;
  latestErrorMessage: string | null;
  turnStartTimes: Map<number, number>;
}

export async function trackRunEventProgress(params: {
  runId: string;
  event: StreamEvent;
  startedAtMs: number;
  progress: RunEventProgress;
  updateRunStateIfNeeded: (
    nextState: PersistedRunState,
    nextTurn: number,
  ) => Promise<void>;
}): Promise<void> {
  const { event, startedAtMs, progress, updateRunStateIfNeeded, runId } = params;

  if (progress.firstTokenLatencyMs === null && event.type === ParserEventType.TEXT) {
    progress.firstTokenLatencyMs = Math.max(0, Date.now() - startedAtMs);
  }

  if (
    event.type === ParserEventType.COMMAND ||
    event.type === ParserEventType.WEB_SEARCH
  ) {
    await updateRunStateIfNeeded("TOOL_EXEC", progress.currentTurn);
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
    await updateRunStateIfNeeded("APPLY", progress.currentTurn);
    return;
  }

  if (event.type === ParserEventType.ERROR) {
    progress.latestErrorMessage = event.message;
    return;
  }

  if (event.type !== ParserEventType.META) {
    return;
  }

  if (typeof event.turn === "number" && event.turn > 0) {
    progress.currentTurn = event.turn;
  }

  if (event.phase === MetaPhase.TURN_START) {
    progress.turnStartTimes.set(progress.currentTurn, Date.now());
    await updateRunStateIfNeeded("LLM_STREAM", progress.currentTurn);
    return;
  }

  if (event.phase === MetaPhase.TURN_COMPLETE) {
    const startedTurnAt = progress.turnStartTimes.get(progress.currentTurn);
    if (typeof startedTurnAt === "number") {
      logger.info(
        {
          runId,
          turn: progress.currentTurn,
          turnLatencyMs: Math.max(0, Date.now() - startedTurnAt),
          metric: "turn_latency",
        },
        "Run turn completed",
      );
    }
    progress.turnStartTimes.delete(progress.currentTurn);

    await updateRunStateIfNeeded("NEXT_TURN", progress.currentTurn);
    return;
  }

  if (event.phase === MetaPhase.SESSION_COMPLETE) {
    progress.latestLoopStopReason = event.loopStopReason ?? null;
    progress.latestTerminationReason = event.terminationReason ?? null;
  }
}
