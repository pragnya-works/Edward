import express, { Router, type Router as ExpressRouter } from "express";
import {
  uploadChatImage,
} from "../controllers/chat/image.controller.js";
import { unifiedSendMessage } from "../controllers/chat/message.controller.js";
import {
  getChatHistory,
  deleteChat,
  getRecentChats,
  getBuildStatus,
  getActiveRun,
  streamBuildEvents,
  streamRunEvents,
  getSandboxFiles,
} from "../controllers/chat/query.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  GetChatHistoryRequestSchema,
  UnifiedSendMessageRequestSchema,
  StreamRunEventsRequestSchema,
} from "../schemas/chat.schema.js";
import {
  chatRateLimiter,
  dailyChatRateLimiter,
} from "../middleware/rateLimit.js";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

export const chatRouter: ExpressRouter = Router();

chatRouter.post(
  "/image-upload",
  chatRateLimiter,
  dailyChatRateLimiter,
  express.raw({
    type: [...IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES],
    limit: `${IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES / (1024 * 1024)}mb`,
  }),
  uploadChatImage,
);
chatRouter.post(
  "/message",
  chatRateLimiter,
  dailyChatRateLimiter,
  validateRequest(UnifiedSendMessageRequestSchema),
  unifiedSendMessage,
);
chatRouter.get(
  "/recent",
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
  "/:chatId/active-run",
  validateRequest(GetChatHistoryRequestSchema),
  getActiveRun,
);
chatRouter.get(
  "/:chatId/build-events",
  validateRequest(GetChatHistoryRequestSchema),
  streamBuildEvents,
);
chatRouter.get(
  "/:chatId/runs/:runId/stream",
  validateRequest(StreamRunEventsRequestSchema),
  streamRunEvents,
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
