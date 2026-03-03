import type { Response } from "express";
import type { ErrorResponder } from "../../../services/chat/access.service.js";
import {
  ERROR_MESSAGES,
  HttpStatus,
} from "../../../utils/constants.js";
import {
  isQueryUseCaseError,
} from "../../../services/chat/query/query.useCaseError.js";

export function sendQueryErrorResponse(params: {
  res: Response;
  error: unknown;
  sendError: ErrorResponder;
}): void {
  if (isQueryUseCaseError(params.error)) {
    params.sendError(
      params.res,
      params.error.status,
      params.error.message,
    );
    return;
  }

  params.sendError(
    params.res,
    HttpStatus.INTERNAL_SERVER_ERROR,
    ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  );
}
