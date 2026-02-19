import type { Response } from "express";
import {
  ParserEventType,
  STREAM_EVENT_VERSION,
  type ErrorEvent,
  type StreamEvent,
} from "@edward/shared/stream-events";

const DEFAULT_MAX_QUEUE_BYTES = 512 * 1024;
const DEFAULT_MAX_QUEUE_EVENTS = 512;

interface SSEWriterState {
  res: Response;
  queue: string[];
  queueBytes: number;
  backpressured: boolean;
  ending: boolean;
  maxQueueBytes: number;
  maxQueueEvents: number;
  onSlowClient?: () => void;
  overflowed: boolean;
}

interface SSEBackpressureConfig {
  maxQueueBytes: number;
  maxQueueEvents: number;
  onSlowClient?: () => void;
}

const WRITER_STATE = new WeakMap<Response, SSEWriterState>();

function createWriterState(
  res: Response,
  config?: Partial<SSEBackpressureConfig>,
): SSEWriterState {
  const state: SSEWriterState = {
    res,
    queue: [],
    queueBytes: 0,
    backpressured: false,
    ending: false,
    maxQueueBytes: config?.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES,
    maxQueueEvents: config?.maxQueueEvents ?? DEFAULT_MAX_QUEUE_EVENTS,
    onSlowClient: config?.onSlowClient,
    overflowed: false,
  };

  if (typeof res.on === "function") {
    res.on("drain", () => {
      flushQueue(state);
    });
  }

  const cleanup = () => {
    state.queue = [];
    state.queueBytes = 0;
    state.backpressured = false;
    state.ending = false;
    WRITER_STATE.delete(res);
  };

  if (typeof res.on === "function") {
    res.on("close", cleanup);
    res.on("finish", cleanup);
  }

  return state;
}

function getWriterState(res: Response): SSEWriterState {
  const existing = WRITER_STATE.get(res);
  if (existing) {
    return existing;
  }

  const state = createWriterState(res);
  WRITER_STATE.set(res, state);
  return state;
}

function flushQueue(state: SSEWriterState): void {
  if (state.overflowed) {
    return;
  }

  while (state.queue.length > 0) {
    const next = state.queue[0];
    if (!next) break;

    if (state.res.writableEnded || !state.res.writable) {
      state.queue = [];
      state.queueBytes = 0;
      state.backpressured = false;
      return;
    }

    const ok = state.res.write(next);
    if (!ok) {
      state.backpressured = true;
      return;
    }

    state.queue.shift();
    state.queueBytes = Math.max(0, state.queueBytes - Buffer.byteLength(next));
  }

  state.backpressured = false;
}

function markOverflow(state: SSEWriterState): void {
  if (state.overflowed) {
    return;
  }

  state.overflowed = true;
  state.queue = [];
  state.queueBytes = 0;
  state.backpressured = false;
  state.onSlowClient?.();
}

function enqueueWrite(state: SSEWriterState, data: string): boolean {
  if (state.res.writableEnded || !state.res.writable || state.overflowed) {
    return false;
  }

  const payloadBytes = Buffer.byteLength(data);

  if (!state.backpressured && state.queue.length === 0) {
    const ok = state.res.write(data);
    if (!ok) {
      state.backpressured = true;
    }
    return true;
  }

  const nextBytes = state.queueBytes + payloadBytes;
  const nextEvents = state.queue.length + 1;
  if (nextBytes > state.maxQueueBytes || nextEvents > state.maxQueueEvents) {
    markOverflow(state);
    return false;
  }

  state.queue.push(data);
  state.queueBytes = nextBytes;
  return true;
}

export function configureSSEBackpressure(
  res: Response,
  config: Partial<SSEBackpressureConfig>,
): void {
  const existing = WRITER_STATE.get(res);
  if (existing) {
    existing.maxQueueBytes = config.maxQueueBytes ?? existing.maxQueueBytes;
    existing.maxQueueEvents = config.maxQueueEvents ?? existing.maxQueueEvents;
    existing.onSlowClient = config.onSlowClient ?? existing.onSlowClient;
    return;
  }

  WRITER_STATE.set(res, createWriterState(res, config));
}

export function safeSSEWrite(res: Response, data: string): boolean {
  const state = getWriterState(res);
  return enqueueWrite(state, data);
}

type VersionlessStreamEvent = StreamEvent extends infer Event
  ? Event extends { version: unknown }
    ? Omit<Event, "version">
    : never
  : never;

export function sendSSEEvent(
  res: Response,
  event: VersionlessStreamEvent | StreamEvent,
): boolean {
  const withVersion = {
    ...event,
    version:
      "version" in event && event.version
        ? event.version
        : STREAM_EVENT_VERSION,
  } as StreamEvent;

  return safeSSEWrite(res, `data: ${JSON.stringify(withVersion)}\n\n`);
}

export function sendSSEEventWithId(
  res: Response,
  eventId: string,
  event: VersionlessStreamEvent | StreamEvent,
): boolean {
  const withVersion = {
    ...event,
    version:
      "version" in event && event.version
        ? event.version
        : STREAM_EVENT_VERSION,
  } as StreamEvent;

  return safeSSEWrite(
    res,
    `id: ${eventId}\ndata: ${JSON.stringify(withVersion)}\n\n`,
  );
}

export function sendSSEError(
  res: Response,
  message: string,
  options?: Partial<Pick<ErrorEvent, "code" | "details">>,
): boolean {
  return sendSSEEvent(res, {
    type: ParserEventType.ERROR,
    message,
    code: options?.code,
    details: options?.details,
  });
}

export function sendSSEComment(res: Response, comment: string): boolean {
  return safeSSEWrite(res, `: ${comment}\n\n`);
}

export function sendSSEDone(res: Response): void {
  if (res.writableEnded || !res.writable) {
    return;
  }

  const state = getWriterState(res);
  if (state.ending) {
    return;
  }
  state.ending = true;

  const wroteDone = enqueueWrite(state, "data: [DONE]\n\n");
  if (!wroteDone) {
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (state.queue.length === 0 && !state.backpressured) {
    res.end();
    return;
  }

  const finalize = () => {
    if (res.writableEnded || !res.writable) {
      return;
    }

    flushQueue(state);
    if (state.queue.length === 0 && !state.backpressured) {
      res.end();
      return;
    }

    if (typeof res.once === "function") {
      res.once("drain", finalize);
    }
  };

  finalize();
}
