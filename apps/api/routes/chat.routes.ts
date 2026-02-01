import { Router, type Router as ExpressRouter } from 'express';
import { getChatHistory, unifiedSendMessage, deleteChat } from '../controllers/chat.controller.js';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  GetChatHistoryRequestSchema,
  UnifiedSendMessageRequestSchema,
} from '../schemas/chat.schema.js';
import { chatRateLimiter, dailyChatRateLimiter } from '../middleware/rateLimit.js';

export const chatRouter: ExpressRouter = Router();

chatRouter.post('/message', chatRateLimiter, dailyChatRateLimiter, validateRequest(UnifiedSendMessageRequestSchema), unifiedSendMessage);
chatRouter.get('/:chatId/history', validateRequest(GetChatHistoryRequestSchema), getChatHistory);
chatRouter.delete('/:chatId', validateRequest(GetChatHistoryRequestSchema), deleteChat);