import type { Response } from "express";
import { MetaPhase, ParserEventType, type StreamEvent } from "@edward/shared/stream-events";
import {
  getRunById,
  getRunEventsAfter,
} from "@edward/auth";
import { createRedisClient } from "../../lib/redis.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { logger } from "../../utils/logger.js";
import {
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
} from "../../utils/sharedConstants.js";
import { getRunEventChannel, type RunEventEnvelope } from "../../services/runs/runEvents.service.js";
import {
  configureSSEBackpressure,
  sendSSEComment,
  sendSSEDone,
  sendSSEEventWithId,
} from "./sse.utils.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_REPLAY_BATCH = 500;

function parseLastEventSeq(raw: unknown): number {
  if (typeof raw !== "string" || raw.length === 0) {
    return 0;
  }

  const trimmed = raw.trim();
  const seqToken = trimmed.includes(":")
    ? trimmed.slice(trimmed.lastIndexOf(":") + 1)
    : trimmed;
  const parsed = Number.parseInt(seqToken, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function isRunTerminalEvent(event: StreamEvent): boolean {
  return (
    event.type === ParserEventType.META &&
    event.phase === MetaPhase.SESSION_COMPLETE
  );
}

function readLastEventId(req: AuthenticatedRequest, explicit?: string): number {
  if (explicit) {
    return parseLastEventSeq(explicit);
  }

  const queryValue =
    typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined;
  const headerValue =
    typeof req.headers["last-event-id"] === "string"
      ? req.headers["last-event-id"]
      : undefined;

  return parseLastEventSeq(queryValue ?? headerValue);
}

interface StreamRunEventsOptions {
  req: AuthenticatedRequest;
  res: Response;
  runId: string;
  explicitLastEventId?: string;
}

export async function streamRunEventsFromPersistence({
  req,
  res,
  runId,
  explicitLastEventId,
}: StreamRunEventsOptions): Promise<void> {
  const redisSub = createRedisClient();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let lastSeq = readLastEventId(req, explicitLastEventId);
  let terminalEventSeen = false;
  let replaying = true;
  const bufferedLiveEvents = new Map<number, RunEventEnvelope>();

  const closeStream = async () => {
    if (closed) return;
    closed = true;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    await redisSub.unsubscribe().catch(() => {});
    await redisSub.quit().catch(() => {});

    if (res.headersSent && !res.writableEnded) {
      sendSSEDone(res);
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on("close", () => {
    void closeStream();
  });

  const emitPersistedEvent = (eventId: string, event: StreamEvent): boolean => {
    if (res.writableEnded || !res.writable) {
      return false;
    }

    const ok = sendSSEEventWithId(res, eventId, event);
    if (!ok) {
      logger.warn({ runId, eventId }, "Run stream write dropped due to slow client");
      return false;
    }

    if (isRunTerminalEvent(event)) {
      terminalEventSeen = true;
    }

    return true;
  };

  const flushBufferedLiveEvents = async (): Promise<boolean> => {
    const pending = Array.from(bufferedLiveEvents.values())
      .filter((item) => item.seq > lastSeq)
      .sort((a, b) => a.seq - b.seq);

    for (const envelope of pending) {
      bufferedLiveEvents.delete(envelope.seq);
      lastSeq = envelope.seq;
      const ok = emitPersistedEvent(envelope.id, envelope.event);
      if (!ok) {
        await closeStream();
        return false;
      }
    }

    return true;
  };

  if (!res.headersSent) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  if (closed) {
    return;
  }

  configureSSEBackpressure(res, {
    maxQueueBytes: MAX_SSE_QUEUE_BYTES,
    maxQueueEvents: MAX_SSE_QUEUE_EVENTS,
    onSlowClient: () => {
      void closeStream();
    },
  });

  const channel = getRunEventChannel(runId);

  const onMessage = (incomingChannel: string, payload: string) => {
    if (closed || incomingChannel !== channel) return;

    try {
      const envelope = JSON.parse(payload) as RunEventEnvelope;
      if (envelope.seq <= lastSeq) {
        return;
      }

      if (replaying) {
        if (!bufferedLiveEvents.has(envelope.seq)) {
          bufferedLiveEvents.set(envelope.seq, envelope);
        }
        return;
      }

      lastSeq = envelope.seq;
      const ok = emitPersistedEvent(envelope.id, envelope.event);
      if (!ok) {
        void closeStream();
        return;
      }

      if (terminalEventSeen) {
        void closeStream();
      }
    } catch (error) {
      logger.warn(
        { error, runId, payload },
        "Failed to parse run event envelope",
      );
    }
  };

  redisSub.on("message", onMessage);
  await redisSub.subscribe(channel);

  if (lastSeq > 0) {
    logger.info(
      { runId, lastEventSeq: lastSeq, metric: "run_reconnect" },
      "Run stream resumed from lastEventId",
    );
  }

  while (!closed) {
    const replayRows = await getRunEventsAfter(runId, lastSeq, MAX_REPLAY_BATCH);
    if (replayRows.length === 0) {
      break;
    }

    for (const row of replayRows) {
      if (closed) break;
      if (row.seq <= lastSeq) continue;

      lastSeq = row.seq;
      const ok = emitPersistedEvent(row.id, row.event as StreamEvent);
      if (!ok) {
        await closeStream();
        return;
      }
    }
  }

  if (!closed) {
    const flushed = await flushBufferedLiveEvents();
    if (!flushed) {
      return;
    }
  }

  replaying = false;

  if (!closed) {
    const flushed = await flushBufferedLiveEvents();
    if (!flushed) {
      return;
    }
  }

  if (terminalEventSeen) {
    await closeStream();
    return;
  }

  const run = await getRunById(runId);
  if (!run) {
    await closeStream();
    return;
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    await closeStream();
    return;
  }

  heartbeat = setInterval(() => {
    sendSSEComment(res, "run-events-heartbeat");
  }, HEARTBEAT_INTERVAL_MS);
}
