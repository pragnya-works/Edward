import { Router, type Router as ExpressRouter } from "express";
import { getSharedChatHistory } from "../controllers/chat/query/share.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { SharedChatHistoryRequestSchema } from "../schemas/chat.schema.js";

export const shareRouter: ExpressRouter = Router();

shareRouter.get(
  "/chats/:chatId/history",
  validateRequest(SharedChatHistoryRequestSchema),
  getSharedChatHistory,
);
