import type { Response } from 'express';
import { db, chat, message, eq, and, gte, count, MessageRole } from '@workspace/auth';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
  ChatIdParamSchema,
  UnifiedSendMessageSchema,
} from '../schemas/chat.schema.js';
import { enqueueChatJob } from '../services/queue.service.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({
    error,
    timestamp: new Date().toISOString(),
  });
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({ value: count() })
    .from(message)
    .where(
      and(
        eq(message.userId, userId),
        gte(message.createdAt, twentyFourHoursAgo),
        eq(message.role, MessageRole.User)
      )
    );

  return (result?.value || 0) >= 10;
}

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as z.infer<typeof UnifiedSendMessageSchema>;

    if (await checkRateLimit(userId)) {
      sendError(res, 429, 'Daily message quota exceeded (10 messages/24h)');
      return;
    }

    let chatId = body.chatId;
    let isNewChat = false;
    const now = new Date();

    if (!chatId) {
      chatId = nanoid(32);
      isNewChat = true;

      await db.insert(chat).values({
        id: chatId,
        userId,
        title: body.title || 'New Chat',
        description: body.description,
        visibility: body.visibility || false,
        createdAt: now,
        updatedAt: now,
      });

      logger.info(`[Chat] Created: ${chatId}`);
    } else {
      const [existing] = await db
        .select({ userId: chat.userId })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);

      if (!existing) {
        sendError(res, 404, 'Chat not found');
        return;
      }

      if (existing.userId !== userId) {
        sendError(res, 403, 'Forbidden');
        return;
      }
    }

    const messageId = nanoid(32);

    try {
      await db.insert(message).values({
        id: messageId,
        chatId,
        userId,
        role: MessageRole.User,
        content: body.content,
        createdAt: now,
        updatedAt: now,
      });

      await enqueueChatJob({
        chatId,
        messageId,
        userId,
        content: body.content,
      });

      logger.info(`[Message] ${messageId} → ${chatId}`);
    } catch (txError) {
      logger.error(txError, 'Transaction failed');
      if (isNewChat) {
        logger.error(`[Chat] Orphaned: ${chatId}`);
      }
      sendError(res, 500, 'Failed to process message');
      return;
    }

    res.status(201).json({
      message: isNewChat
        ? 'Chat created and message sent successfully'
        : 'Message sent and queued for processing',
      data: {
        messageId,
        chatId,
        isNewChat,
      },
      timestamp: now.toISOString(),
    });

  } catch (error) {
    logger.error(error, 'unifiedSendMessage error');
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

    const [[chatData], messages] = await Promise.all([
      db
        .select({ userId: chat.userId, visibility: chat.visibility })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1),
      db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(message.createdAt)
    ]);

    if (!chatData) {
      sendError(res, 404, 'Chat not found');
      return;
    }

    if (chatData.userId !== userId && !chatData.visibility) {
      sendError(res, 403, 'Forbidden');
      return;
    }

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
