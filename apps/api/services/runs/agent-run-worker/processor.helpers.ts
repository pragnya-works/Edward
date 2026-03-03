import { EventEmitter } from "node:events";
import {
  and,
  db,
  eq,
  inArray,
  RUN_STATUS,
  run as runTable,
  type RunStatus,
  updateRun,
} from "@edward/auth";
import {
  MetaPhase,
  ParserEventType,
  type StreamEvent,
  type StreamTerminationReason,
} from "@edward/shared/streamEvents";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import { persistRunEvent } from "../runEvents.service.js";

interface Publisher {
  publish(channel: string, payload: string): Promise<unknown>;
}

export type RunEventCaptureResponse = EventEmitter & {
  writable: boolean;
  writableEnded: boolean;
  setHeader: () => void;
  write: (chunk: string | Buffer) => boolean;
  end: () => void;
  flushPending: () => Promise<void>;
};

export type PersistedRunState =
  | "INIT"
  | "LLM_STREAM"
  | "TOOL_EXEC"
  | "APPLY"
  | "NEXT_TURN";

export function createRunEventCaptureResponse(
  onEvent: (event: StreamEvent) => Promise<void>,
): RunEventCaptureResponse {
  const response = new EventEmitter() as RunEventCaptureResponse;
  let sseBuffer = "";
  let pending = Promise.resolve();
  let persistFailure: Error | null = null;

  response.writable = true;
  response.writableEnded = false;
  response.setHeader = () => {
    // No-op for worker-captured streams.
  };
  response.write = (chunk: string | Buffer): boolean => {
    if (response.writableEnded || !response.writable) {
      return false;
    }

    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    sseBuffer += text;

    const normalized = sseBuffer.replaceAll("\r\n", "\n");
    const frames = normalized.split("\n\n");
    sseBuffer = frames.pop() ?? "";

    for (const frame of frames) {
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!payload || payload === "[DONE]") {
        continue;
      }

      if (persistFailure) {
        continue;
      }

      pending = pending.then(async () => {
        try {
          const parsed = JSON.parse(payload) as StreamEvent;
          await onEvent(parsed);
        } catch (error) {
          const err = ensureError(error);
          persistFailure = err;
          logger.error(
            { error: err, payload },
            "Failed to persist captured run event",
          );
        }
      });
    }

    return true;
  };
  response.end = () => {
    if (response.writableEnded) return;
    response.writable = false;
    response.writableEnded = true;
    response.emit("finish");
    response.emit("close");
  };
  response.flushPending = async () => {
    await pending;
    if (persistFailure) {
      throw persistFailure;
    }
  };

  return response;
}

export function mapTerminationToStatus(
  terminationReason: StreamTerminationReason | null,
): {
  status: RunStatus;
  state: "COMPLETE" | "FAILED" | "CANCELLED";
} {
  if (!terminationReason) {
    return { status: RUN_STATUS.FAILED, state: "FAILED" };
  }

  if (terminationReason === "client_disconnect") {
    return { status: RUN_STATUS.CANCELLED, state: "CANCELLED" };
  }

  if (
    terminationReason === "stream_failed" ||
    terminationReason === "aborted" ||
    terminationReason === "stream_timeout" ||
    terminationReason === "slow_client"
  ) {
    return { status: RUN_STATUS.FAILED, state: "FAILED" };
  }

  return { status: RUN_STATUS.COMPLETED, state: "COMPLETE" };
}

export function readTerminationFromTerminalEvent(
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

export async function markRunRunningIfAdmissible(
  runId: string,
  startedAt: Date,
): Promise<boolean> {
  const transitionedRows = await db
    .update(runTable)
    .set({
      status: RUN_STATUS.RUNNING,
      state: "INIT",
      startedAt,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(runTable.id, runId),
        inArray(runTable.status, [RUN_STATUS.QUEUED]),
      ),
    )
    .returning({ id: runTable.id });

  return transitionedRows.length > 0;
}

export async function updateRunWithLog(
  runId: string,
  patch: Parameters<typeof updateRun>[1],
  context: string,
): Promise<boolean> {
  try {
    await updateRun(runId, patch);
    return true;
  } catch (error) {
    logger.error(
      { runId, context, patch, error: ensureError(error) },
      "Failed to persist run state update",
    );
    return false;
  }
}

export async function persistRunEventWithLog(
  runId: string,
  event: StreamEvent,
  publisher: Publisher,
  context: string,
): Promise<boolean> {
  try {
    await persistRunEvent(runId, event, publisher);
    return true;
  } catch (error) {
    logger.error(
      { runId, context, error: ensureError(error), eventType: event.type },
      "Failed to persist run event",
    );
    return false;
  }
}
