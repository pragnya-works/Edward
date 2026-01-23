import type { Response } from 'express';
import { db, chat, message, eq, and, gte, count, MessageRole } from '@workspace/auth';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
  ChatIdParamSchema,
  UnifiedSendMessageSchema,
  ParserEventType,
} from '../schemas/chat.schema.js';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { streamResponse } from '../lib/llm/response.js';
import { createStreamParser } from '../lib/llm/parser.js';
import { getDecryptedApiKey } from '../services/apiKey.service.js';
import { HttpStatus, ERROR_MESSAGES } from '../utils/constants.js';
import { sendError as sendStandardError, sendSuccess } from '../utils/response.js';

const DAILY_MESSAGE_LIMIT = 10;

function sendError(res: Response, status: HttpStatus, error: string): void {
  if (res.headersSent) {
    res.write(`data: ${JSON.stringify({ type: ParserEventType.ERROR, message: error })}\n\n`);
    res.end();
    return;
  }
  
  sendStandardError(res, status, error);
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

  return (result?.value || 0) >= DAILY_MESSAGE_LIMIT;
}

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const validated = UnifiedSendMessageSchema.safeParse(req.body);

    if (!validated.success) {
      sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR);
      return;
    }

    const body = validated.data;

    if (await checkRateLimit(userId)) {
      sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Daily message quota exceeded (10 messages/24h)');
      return;
    }

    let decryptedApiKey: string;
    try {
      decryptedApiKey = await getDecryptedApiKey(userId);
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message === 'API key not found') {
        sendError(res, HttpStatus.BAD_REQUEST, 'No API key found. Please configure your settings.');
      } else {
        logger.error(error, 'Failed to decrypt API key');
        sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Error processing API key. Please re-save it in settings.');
      }
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
        sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        return;
      }

      if (existing.userId !== userId) {
        sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
        return;
      }
    }

    const userMessageId = nanoid(32);
    const assistantMessageId = nanoid(32);

    await db.insert(message).values({
      id: userMessageId,
      chatId,
      userId,
      role: MessageRole.User,
      content: body.content,
      createdAt: now,
      updatedAt: now,
    });
    
    logger.info(`[Message] User: ${userMessageId} → ${chatId}`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({
      type: ParserEventType.META,
      chatId,
      userMessageId,
      assistantMessageId,
      isNewChat
    })}\n\n`);

    const parser = createStreamParser();
    let fullRawResponse = '';

    try {
      const stream = streamResponse(decryptedApiKey, body.content);
      
      for await (const chunk of stream) {
        fullRawResponse += chunk;
        const events = parser.process(chunk);
        
        for (const event of events) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      const finalEvents = parser.flush();
      for (const event of finalEvents) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      await db.insert(message).values({
        id: assistantMessageId,
        chatId,
        userId,
        role: MessageRole.Assistant,
        content: fullRawResponse,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.info(`[Message] Assistant: ${assistantMessageId} saved.`);
      
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (streamError) {
      logger.error(streamError, 'Streaming error');
      res.write(`data: ${JSON.stringify({ type: ParserEventType.ERROR, message: 'Stream processing failed' })}\n\n`);
      res.end();
      
      try {
        await db.insert(message).values({
          id: assistantMessageId,
          chatId,
          userId,
          role: MessageRole.Assistant,
          content: fullRawResponse || `Error: ${(streamError as Error).message}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (dbError) {
        logger.error(dbError, 'Failed to save error message to database');
      }
    }

  } catch (error) {
    logger.error(error, 'unifiedSendMessage error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const validated = ChatIdParamSchema.safeParse(req.params);

    if (!validated.success) {
      sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR);
      return;
    }

    const { chatId } = validated.data;

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
      sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (chatData.userId !== userId && !chatData.visibility) {
      sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    sendSuccess(res, HttpStatus.OK, 'Chat history retrieved successfully', {
      chatId,
      messages,
    });
  } catch (error) {
    logger.error(error, 'getChatHistory error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}