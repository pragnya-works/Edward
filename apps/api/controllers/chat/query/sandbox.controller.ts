import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../../../utils/response.js";
import { HttpStatus } from "../../../utils/constants.js";
import { getSandboxFilesUseCase } from "../../../services/chat/query/sandbox.useCase.js";
import { toChatRequestContext } from "../../../services/chat/query/requestContext.js";
import { sendQueryErrorResponse } from "./queryErrorResponse.js";
import { requireAuthorizedChatRequest } from "./chatRequestAccess.js";

export async function getSandboxFiles(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const request = await requireAuthorizedChatRequest({
      req,
      res,
      sendError: sendStandardError,
    });
    if (!request) {
      return;
    }

    const context = toChatRequestContext(request);
    const { sandboxId, files } = await getSandboxFilesUseCase(context);

    sendSuccess(res, HttpStatus.OK, "Sandbox files retrieved successfully", {
      chatId: context.chatId,
      sandboxId,
      files,
      totalFiles: files.length,
    });
  } catch (error) {
    logger.error(ensureError(error), "getSandboxFiles error");
    sendQueryErrorResponse({
      res,
      error,
      sendError: sendStandardError,
    });
  }
}
