import { Router, type Router as ExpressRouter } from "express";
import {
  getChatHistory,
  unifiedSendMessage,
  deleteChat,
  getRecentChats,
  getBuildStatus,
  getSandboxFiles,
} from "../controllers/chat.controller.js";

import { validateRequest } from "../middleware/validateRequest.js";
import {
  GetChatHistoryRequestSchema,
  UnifiedSendMessageRequestSchema,
  RecentChatsQuerySchema,
} from "../schemas/chat.schema.js";
import {
  chatRateLimiter,
  dailyChatRateLimiter,
} from "../middleware/rateLimit.js";

export const chatRouter: ExpressRouter = Router();

chatRouter.post(
  "/message",
  chatRateLimiter,
  dailyChatRateLimiter,
  validateRequest(UnifiedSendMessageRequestSchema),
  unifiedSendMessage,
);
chatRouter.get(
  "/recent",
  validateRequest(RecentChatsQuerySchema),
  getRecentChats,
);
chatRouter.get(
  "/:chatId/history",
  validateRequest(GetChatHistoryRequestSchema),
  getChatHistory,
);
chatRouter.get(
  "/:chatId/build-status",
  validateRequest(GetChatHistoryRequestSchema),
  getBuildStatus,
);
chatRouter.get(
  "/:chatId/sandbox-files",
  validateRequest(GetChatHistoryRequestSchema),
  getSandboxFiles,
);
chatRouter.delete(
  "/:chatId",
  validateRequest(GetChatHistoryRequestSchema),
  deleteChat,
);
