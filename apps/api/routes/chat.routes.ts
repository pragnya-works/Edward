import express, { Router, type Router as ExpressRouter } from "express";
import {
  uploadChatImage,
} from "../controllers/chat/image.controller.js";
import { unifiedSendMessage } from "../controllers/chat/message.controller.js";
import { enhancePrompt } from "../controllers/chat/promptEnhance.controller.js";
import {
  getChatHistory,
  getChatMeta,
  deleteChat,
  getRecentChats,
} from "../controllers/chat/query/history.controller.js";
import {
  getBuildStatus,
  triggerRebuild,
  streamBuildEvents,
} from "../controllers/chat/query/build.controller.js";
import {
  getActiveRun,
  streamRunEvents,
  cancelRunHandler,
} from "../controllers/chat/query/run.controller.js";
import { getSandboxFiles } from "../controllers/chat/query/sandbox.controller.js";

import {
  checkSubdomainAvailabilityHandler,
  updateChatSubdomainHandler,
} from "../controllers/chat/subdomain.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  GetChatHistoryRequestSchema,
  PromptEnhanceRequestSchema,
  RebuildRequestSchema,
  UnifiedSendMessageRequestSchema,
  StreamRunEventsRequestSchema,
  CancelRunRequestSchema,

} from "../schemas/chat.schema.js";
import {
  chatRateLimiter,
  dailyChatRateLimiter,
  imageUploadRateLimiter,
  promptEnhanceRateLimiter,
} from "../middleware/rateLimit.js";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

export const chatRouter: ExpressRouter = Router();

chatRouter.post(
  "/image-upload",
  imageUploadRateLimiter,
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
chatRouter.post(
  "/prompt-enhance",
  promptEnhanceRateLimiter,
  validateRequest(PromptEnhanceRequestSchema),
  enhancePrompt,
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
  "/:chatId/meta",
  validateRequest(GetChatHistoryRequestSchema),
  getChatMeta,
);
chatRouter.get(
  "/:chatId/build-status",
  validateRequest(GetChatHistoryRequestSchema),
  getBuildStatus,
);
chatRouter.post(
  "/:chatId/rebuild",
  validateRequest(RebuildRequestSchema),
  triggerRebuild,
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
chatRouter.post(
  "/:chatId/runs/:runId/cancel",
  validateRequest(CancelRunRequestSchema),
  cancelRunHandler,
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
chatRouter.get(
  "/subdomain/check",
  checkSubdomainAvailabilityHandler,
);
chatRouter.patch(
  "/:chatId/subdomain",
  validateRequest(GetChatHistoryRequestSchema),
  updateChatSubdomainHandler,
);
