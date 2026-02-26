import type { Response } from "express";
import type {
  ErrorEvent,
  StreamErrorSeverity,
  StreamEvent,
} from "@edward/shared/streamEvents";
import {
  configureSSEBackpressure as configureSSEBackpressureInternal,
  safeSSEWrite as safeSSEWriteInternal,
  sendSSEComment as sendSSECommentInternal,
  sendSSEDone as sendSSEDoneInternal,
  sendSSEError as sendSSEErrorInternal,
  sendSSERecoverableError as sendSSERecoverableErrorInternal,
  sendSSEEvent as sendSSEEventInternal,
  sendSSEEventWithId as sendSSEEventWithIdInternal,
} from "../../services/sse.utils/service.js";

interface SSEBackpressureConfig {
  maxQueueBytes: number;
  maxQueueEvents: number;
  onSlowClient?: () => void;
}

type VersionlessStreamEvent = StreamEvent extends infer Event
  ? Event extends { version: unknown }
    ? Omit<Event, "version">
    : never
  : never;

export function configureSSEBackpressure(
  res: Response,
  config: Partial<SSEBackpressureConfig>,
): void {
  configureSSEBackpressureInternal(res, config);
}

export function safeSSEWrite(res: Response, data: string): boolean {
  return safeSSEWriteInternal(res, data);
}

export function sendSSEEvent(
  res: Response,
  event: VersionlessStreamEvent | StreamEvent,
): boolean {
  return sendSSEEventInternal(res, event);
}

export function sendSSEEventWithId(
  res: Response,
  eventId: string,
  event: VersionlessStreamEvent | StreamEvent,
): boolean {
  return sendSSEEventWithIdInternal(res, eventId, event);
}

export function sendSSEError(
  res: Response,
  message: string,
  options?: Partial<Pick<ErrorEvent, "code" | "details">> & {
    severity?: StreamErrorSeverity;
  },
): boolean {
  return sendSSEErrorInternal(res, message, options);
}

export function sendSSERecoverableError(
  res: Response,
  message: string,
  options?: Partial<Pick<ErrorEvent, "code" | "details">>,
): boolean {
  return sendSSERecoverableErrorInternal(res, message, options);
}

export function sendSSEComment(res: Response, comment: string): boolean {
  return sendSSECommentInternal(res, comment);
}

export function sendSSEDone(res: Response): void {
  sendSSEDoneInternal(res);
}
