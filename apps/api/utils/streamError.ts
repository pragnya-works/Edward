import type { Response } from "express";
import { HttpStatus } from "./constants.js";
import { sendError as sendStandardError } from "./response.js";
import { sendSSEError } from "../services/sse-utils/service.js";

export function sendStreamError(
  res: Response,
  status: HttpStatus,
  error: string,
): void {
  if (res.headersSent) {
    if (!res.writableEnded && res.writable) {
      sendSSEError(res, error, { code: "stream_error" });
    }

    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  sendStandardError(res, status, error);
}
