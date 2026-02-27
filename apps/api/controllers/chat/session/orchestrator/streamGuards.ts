import type { Response } from "express";
import { StreamTerminationReason } from "@edward/shared/streamEvents";
import type { AuthenticatedRequest } from "../../../../middleware/auth.js";
import {
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
  MAX_STREAM_DURATION_MS,
} from "../../../../utils/constants.js";
import { logger } from "../../../../utils/logger.js";
import { configureSSEBackpressure } from "../../sse.utils.js";

interface SetupStreamGuardsParams {
  req: AuthenticatedRequest;
  res: Response;
  chatId: string;
  runId: string;
  abortController: AbortController;
  externalSignal?: AbortSignal;
}

interface StreamGuardsHandle {
  getAbortReason: () => StreamTerminationReason | null;
  clear: () => void;
}

export function setupStreamGuards(
  params: SetupStreamGuardsParams,
): StreamGuardsHandle {
  const { req, res, chatId, runId, abortController, externalSignal } = params;

  let abortReason: StreamTerminationReason | null = null;
  let externalAbortHandler: (() => void) | null = null;

  const abortStream = (reason: StreamTerminationReason) => {
    if (!abortController.signal.aborted) {
      abortReason = reason;
      abortController.abort();
    }
  };

  configureSSEBackpressure(res, {
    maxQueueBytes: MAX_SSE_QUEUE_BYTES,
    maxQueueEvents: MAX_SSE_QUEUE_EVENTS,
    onSlowClient: () => {
      logger.warn({ chatId, runId }, "SSE queue overflow - aborting slow client stream");
      abortStream(StreamTerminationReason.SLOW_CLIENT);
    },
  });

  const streamTimer = setTimeout(() => {
    logger.warn({ chatId, runId }, "Stream timeout reached");
    abortStream(StreamTerminationReason.STREAM_TIMEOUT);
  }, MAX_STREAM_DURATION_MS);

  req.on("close", () => {
    logger.info({ chatId, runId }, "Connection closed by client");
    if (streamTimer) clearTimeout(streamTimer);
    abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
  });

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
    } else {
      externalAbortHandler = () => {
        logger.info({ chatId, runId }, "External abort signal received - cancelling stream");
        if (streamTimer) clearTimeout(streamTimer);
        abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
      };
      externalSignal.addEventListener(
        "abort",
        externalAbortHandler,
        { once: true },
      );
    }
  }

  return {
    getAbortReason: () => abortReason,
    clear: () => {
      if (streamTimer) clearTimeout(streamTimer);
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
        externalAbortHandler = null;
      }
    },
  };
}
