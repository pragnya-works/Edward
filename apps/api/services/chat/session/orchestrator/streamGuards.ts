import type { Response } from "express";
import { StreamTerminationReason } from "@edward/shared/streamEvents";
import type { AuthenticatedRequest } from "../../../../middleware/auth.js";
import { logger } from "../../../../utils/logger.js";

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

  const abortStream = (reason: StreamTerminationReason) => {
    if (!abortController.signal.aborted) {
      abortReason = reason;
      abortController.abort();
    }
  };

  req.on("close", () => {
    logger.info({ chatId, runId }, "Connection closed by client");
    abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
  });

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
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
        externalAbortHandler = null;
      }
    },
  };
}
