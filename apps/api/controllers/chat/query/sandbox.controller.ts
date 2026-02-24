import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import { getActiveSandbox } from "../../../services/sandbox/lifecycle/provisioning.js";
import {
  readAllProjectFiles,
  readProjectFilesFromS3,
} from "../../../services/sandbox/read.service.js";
import { ERROR_MESSAGES, HttpStatus } from "../../../utils/constants.js";
import { ensureError } from "../../../utils/error.js";
import { logger } from "../../../utils/logger.js";
import {
  sendError as sendStandardError,
  sendSuccess,
} from "../../../utils/response.js";
import { assertChatOwnedOrRespond, getChatIdOrRespond } from "../access/chatAccess.service.js";

export async function getSandboxFiles(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendStandardError);

    if (!chatId) {
      return;
    }

    const hasAccess = await assertChatOwnedOrRespond(
      chatId,
      userId,
      res,
      sendStandardError,
    );
    if (!hasAccess) {
      return;
    }

    const sandboxId = await getActiveSandbox(chatId);
    let filesMap: Map<string, string>;

    if (!sandboxId) {
      logger.info(
        { chatId, userId },
        "No active sandbox, falling back to S3 for files",
      );
      filesMap = await readProjectFilesFromS3(userId, chatId);
    } else {
      filesMap = await readAllProjectFiles(sandboxId);
    }

    const files = Array.from(filesMap.entries()).map(([path, content]) => ({
      path,
      content,
      isComplete: true,
    }));

    sendSuccess(res, HttpStatus.OK, "Sandbox files retrieved successfully", {
      chatId,
      sandboxId,
      files,
      totalFiles: files.length,
    });
  } catch (error) {
    logger.error(ensureError(error), "getSandboxFiles error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
