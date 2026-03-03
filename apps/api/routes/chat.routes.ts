import express, { Router, type Router as ExpressRouter } from "express";
import {
  uploadChatImageUseCase,
} from "../services/chat/imageUpload.useCase.js";
import { unifiedSendMessage } from "../services/runs/messageOrchestrator.service.js";
import { enhancePromptUseCase } from "../services/chat/promptEnhance.useCase.js";
import {
  getChatHistory,
  getChatMeta,
  deleteChat,
  getRecentChats,
} from "../controllers/chat/query/history.controller.js";
import {
  getBuildStatus,
  streamBuildEvents,
} from "../controllers/chat/query/build.controller.js";
import {
  getActiveRun,
  streamRunEvents,
  cancelRunHandler,
} from "../controllers/chat/query/run.controller.js";
import { getSandboxFiles } from "../controllers/chat/query/sandbox.controller.js";

import {
  checkSubdomainAvailability,
  updateChatSubdomain,
} from "../services/previewRouting/subdomainUpdate.service.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  GetChatHistoryRequestSchema,
  PromptEnhanceRequestSchema,
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
  uploadChatImageUseCase,
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
  enhancePromptUseCase,
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
  checkSubdomainAvailability,
);
chatRouter.patch(
  "/:chatId/subdomain",
  validateRequest(GetChatHistoryRequestSchema),
  updateChatSubdomain,
);
