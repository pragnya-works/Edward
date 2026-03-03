import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../../middleware/auth.js";
import {
  assertChatAccessOrRespond,
  getChatIdOrRespond,
  type ErrorResponder,
} from "../../../services/chat/access.service.js";

export interface AuthorizedChatRequest {
  chatId: string;
  userId: string;
}

export async function requireAuthorizedChatRequest(params: {
  req: AuthenticatedRequest;
  res: Response;
  sendError: ErrorResponder;
}): Promise<AuthorizedChatRequest | null> {
  const { req, res, sendError } = params;
  const userId = getAuthenticatedUserId(req);
  const chatId = getChatIdOrRespond(req.params.chatId, res, sendError);
  if (!chatId) {
    return null;
  }

  const hasAccess = await assertChatAccessOrRespond(chatId, userId, res, sendError);

  if (!hasAccess) {
    return null;
  }

  return { chatId, userId };
}
