import type { Response } from "express";
import { StreamTerminationReason } from "@edward/shared/streamEvents";
import type { AuthenticatedRequest } from "../../../../middleware/auth.js";
import { logger } from "../../../../utils/logger.js";

const DEFAULT_STREAM_GUARD_TIMEOUT_MS = 20 * 60 * 1000;

function readStreamGuardTimeoutMs(): number {
  const raw = process.env.STREAM_GUARD_TIMEOUT_MS;
  if (!raw) return DEFAULT_STREAM_GUARD_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STREAM_GUARD_TIMEOUT_MS;
}

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
  const { req, chatId, runId, abortController, externalSignal } = params;

  let abortReason: StreamTerminationReason | null = null;
  let externalAbortHandler: (() => void) | null = null;
  let requestCloseHandler: (() => void) | null = null;
  let abortControllerHandler: (() => void) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const abortStream = (reason: StreamTerminationReason) => {
    if (!abortController.signal.aborted) {
      abortReason = reason;
      abortController.abort();
    }
  };

  requestCloseHandler = () => {
    logger.info({ chatId, runId }, "Connection closed by client");
    abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
  };
  req.on("close", requestCloseHandler);

  if (!abortController.signal.aborted) {
    const timeoutMs = readStreamGuardTimeoutMs();
    timeoutId = setTimeout(() => {
      logger.warn(
        { chatId, runId, timeoutMs },
        "Server-side stream timeout reached; aborting stream",
      );
      abortStream(StreamTerminationReason.STREAM_TIMEOUT);
    }, timeoutMs);

    abortControllerHandler = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    abortController.signal.addEventListener("abort", abortControllerHandler, {
      once: true,
    });
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
    } else {
      externalAbortHandler = () => {
        logger.info({ chatId, runId }, "External abort signal received - cancelling stream");
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
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (
        requestCloseHandler &&
        typeof req.removeListener === "function"
      ) {
        req.removeListener("close", requestCloseHandler);
        requestCloseHandler = null;
      }
      if (abortControllerHandler) {
        abortController.signal.removeEventListener("abort", abortControllerHandler);
        abortControllerHandler = null;
      }
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
        externalAbortHandler = null;
      }
    },
  };
}
