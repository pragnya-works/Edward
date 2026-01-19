import { Router, type Router as ExpressRouter } from 'express';
import { createChat, sendMessage, getChatHistory } from '../controllers/chat.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  CreateChatRequestSchema,
  SendMessageRequestSchema,
  GetChatHistoryRequestSchema,
} from '../schemas/chat.schema.js';

export function createChatRouter(): ExpressRouter {
  const router = Router();

  router.post('/', validateRequest(CreateChatRequestSchema), createChat);
  router.post('/:chatId/message', validateRequest(SendMessageRequestSchema), sendMessage);
  router.get('/:chatId/history', validateRequest(GetChatHistoryRequestSchema), getChatHistory);

  return router;
}
