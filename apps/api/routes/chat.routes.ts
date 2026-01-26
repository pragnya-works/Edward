import { Router, type Router as ExpressRouter } from 'express';
import { getChatHistory, unifiedSendMessage } from '../controllers/chat.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  GetChatHistoryRequestSchema,
  UnifiedSendMessageRequestSchema,
} from '../schemas/chat.schema.js';

export const chatRouter: ExpressRouter = Router();

chatRouter.post('/message', validateRequest(UnifiedSendMessageRequestSchema), unifiedSendMessage);
chatRouter.get('/:chatId/history', validateRequest(GetChatHistoryRequestSchema), getChatHistory);
