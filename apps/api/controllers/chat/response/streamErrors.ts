import type { Response } from "express";
import type { ErrorResponder } from "../access/chatAccess.service.js";
import { sendError as sendStandardError } from "../../../utils/response.js";
import { sendSSEError } from "../sse.utils.js";

export function sendStreamError(
  res: Response,
  status: Parameters<ErrorResponder>[1],
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
