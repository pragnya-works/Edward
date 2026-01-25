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
import { provisionSandbox, writeSandboxFile, cleanupSandbox, prepareSandboxFile, flushSandbox } from '../services/sandbox.service.js';
import { ensureError } from '../utils/error.js';

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
    } catch (err) {
      const error = ensureError(err);
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
    let currentSandboxId: string | undefined;
    let currentFilePath: string | undefined;

    const abortController = new AbortController();
    req.on('close', () => {
      logger.info(`[Chat] Connection closed by client: ${chatId}`);
      abortController.abort();
    });

    try {
      const stream = streamResponse(decryptedApiKey, body.content, abortController.signal);

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        fullRawResponse += chunk;
        const events = parser.process(chunk);

        for (const event of events) {
          try {
            switch (event.type) {
              case ParserEventType.SANDBOX_START:
                if (currentSandboxId) {
                  await cleanupSandbox(currentSandboxId).catch((err) =>
                    logger.error(ensureError(err), `Failed to cleanup previous sandbox: ${currentSandboxId}`)
                  );
                }
                currentSandboxId = await provisionSandbox();
                break;

              case ParserEventType.FILE_START:
                if (!currentSandboxId) {
                  logger.error('[Chat] FILE_START received without active sandbox');
                  res.write(`data: ${JSON.stringify({ type: ParserEventType.ERROR, message: 'No active sandbox for file operation' })}\n\n`);
                  break;
                }
                currentFilePath = event.path;
                await prepareSandboxFile(currentSandboxId, currentFilePath);
                break;

              case ParserEventType.FILE_CONTENT:
                if (!currentSandboxId) {
                  logger.error('[Chat] FILE_CONTENT received without active sandbox');
                  break;
                }
                if (!currentFilePath) {
                  logger.error('[Chat] FILE_CONTENT received without active file');
                  break;
                }
                await writeSandboxFile(currentSandboxId, currentFilePath, event.content);
                break;

              case ParserEventType.FILE_END:
                currentFilePath = undefined;
                break;
            }
          } catch (sandboxError) {
            logger.error(ensureError(sandboxError), 'Sandbox operation failed during streaming');
            res.write(`data: ${JSON.stringify({
              type: ParserEventType.ERROR,
              message: 'Sandbox execution failed'
            })}\n\n`);
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      if (abortController.signal.aborted) {
        res.end();
        return;
      }

      const finalEvents = parser.flush();
      for (const event of finalEvents) {
        try {
          switch (event.type) {
            case ParserEventType.FILE_START:
              if (!currentSandboxId) {
                logger.error('[Chat] FILE_START in flush without active sandbox');
                break;
              }
              currentFilePath = event.path;
              await prepareSandboxFile(currentSandboxId, currentFilePath);
              break;

            case ParserEventType.FILE_CONTENT:
              if (currentSandboxId && currentFilePath) {
                await writeSandboxFile(currentSandboxId, currentFilePath, event.content);
              }
              break;

            case ParserEventType.FILE_END:
              currentFilePath = undefined;
              break;

            case ParserEventType.SANDBOX_END:
              if (currentSandboxId) {
                await flushSandbox(currentSandboxId).catch((err) =>
                  logger.error(ensureError(err), `Flush failed during SANDBOX_END: ${currentSandboxId}`)
                );
              }
              break;
          }
        } catch (sandboxError) {
          logger.error(ensureError(sandboxError), 'Final sandbox operation failed');
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      if (currentSandboxId) {
        await flushSandbox(currentSandboxId).catch((err) =>
          logger.error(ensureError(err), `Final flush failed for sandbox: ${currentSandboxId}`)
        );
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
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (streamError) {
      const error = ensureError(streamError);
      if (currentSandboxId) {
        await cleanupSandbox(currentSandboxId).catch((err) =>
          logger.error(ensureError(err), `Cleanup failed after stream error: ${currentSandboxId}`)
        );
      }

      logger.error(error, 'Streaming error');

      if (!res.headersSent) {
        res.write(`data: ${JSON.stringify({
          type: ParserEventType.ERROR,
          message: 'Stream processing failed'
        })}\n\n`);
      }

      res.end();

      try {
        await db.insert(message).values({
          id: assistantMessageId,
          chatId,
          userId,
          role: MessageRole.Assistant,
          content: fullRawResponse || `Error: ${error.message}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (dbError) {
        logger.error(ensureError(dbError), 'Failed to save error message to database');
      }
    }

  } catch (error) {
    logger.error(ensureError(error), 'unifiedSendMessage error');
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
    logger.error(ensureError(error), 'getChatHistory error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}