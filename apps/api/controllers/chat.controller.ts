import type { Response } from 'express';
import { db, chat, message, eq, and, gte, count, MessageRole } from '@workspace/auth';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
  CreateChatSchema,
  SendMessageSchema,
  ChatIdParamSchema,
} from '../schemas/chat.schema.js';
import { enqueueChatJob } from '../services/queue.service.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { logger } from '@workspace/logger';

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({
    error,
    timestamp: new Date().toISOString(),
  });
}

export async function createChat(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as z.infer<typeof CreateChatSchema>;

    const chatId = nanoid(32);

    await db.insert(chat).values({
      id: chatId,
      userId: userId,
      title: body.title || 'New Chat',
      description: body.description,
      visibility: body.visibility || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({
      message: 'Chat created successfully',
      data: {
        chatId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'createChat error');
    sendError(res, 500, 'Internal server error');
  }
}

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as z.infer<typeof SendMessageSchema>;
    const params = req.params as z.infer<typeof ChatIdParamSchema>;
    const { chatId } = params;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [messageCountResult] = await db
      .select({ value: count() })
      .from(message)
      .where(
        and(
          eq(message.userId, userId),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, MessageRole.User)
        )
      );

    const messageCount = messageCountResult?.value || 0;

    if (messageCount >= 10) {
      sendError(res, 429, 'Daily message quota exceeded (10 messages/24h)');
      return;
    }

    const [chatExists] = await db
      .select()
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatExists) {
      sendError(res, 404, 'Chat not found');
      return;
    }

    if (chatExists.userId !== userId) {
       sendError(res, 403, 'You do not have permission to send messages to this chat');
       return;
    }

    const messageId = nanoid(32);
    await db.insert(message).values({
      id: messageId,
      chatId: chatId,
      userId: userId,
      role: MessageRole.User,
      content: body.content,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await enqueueChatJob({
      chatId,
      messageId,
      userId,
      content: body.content,
    });

    res.status(201).json({
      message: 'Message sent and queued for processing',
      data: {
        messageId,
        chatId,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error(error, 'sendMessage error');
    sendError(res, 500, 'Internal server error');
  }
}

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const params = req.params as z.infer<typeof ChatIdParamSchema>;
    const { chatId } = params;

    const [chatData] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);

    if (!chatData) {
        sendError(res, 404, 'Chat not found');
        return;
    }

    if (chatData.userId !== userId && !chatData.visibility) {
        sendError(res, 403, 'Unauthorized access to chat history');
        return;
    }

    const messages = await db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(message.createdAt);

    res.status(200).json({
      message: 'Chat history retrieved successfully',
      data: {
        chatId,
        messages,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'getChatHistory error');
    sendError(res, 500, 'Internal server error');
  }
}
