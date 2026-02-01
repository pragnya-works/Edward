import type { Response } from 'express';
import { db, chat, message, eq, MessageRole } from '@edward/auth';
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
import { cleanupSandbox, getActiveSandbox } from '../services/sandbox/lifecycle.sandbox.js';
import { prepareSandboxFile, writeSandboxFile, flushSandbox } from '../services/sandbox/writes.sandbox.js';
import { backupSandbox } from '../services/sandbox/backup.sandbox.js';
import { buildAndUploadUnified } from '../services/sandbox/builder/unified.build.js';
import { ensureError } from '../utils/error.js';
import { deleteFolder, buildS3Key } from '../services/storage.service.js';
import { getOrCreateChat, saveMessage } from '../services/chat.service.js';
import { createWorkflow, advanceWorkflow, ensureSandbox } from '../services/planning/workflow.engine.js';

async function handleFileContent(
  sandboxId: string,
  filePath: string,
  content: string,
  isFirstChunk: boolean
): Promise<void> {
  let processedContent = content;
  if (isFirstChunk) {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('```')) {
      const newlineIdx = trimmed.indexOf('\n');
      processedContent = newlineIdx !== -1 ? trimmed.slice(newlineIdx + 1) : '';
    }
  }
  if (processedContent) {
    await writeSandboxFile(sandboxId, filePath, processedContent);
  }
}

function sendError(res: Response, status: HttpStatus, error: string): void {
  if (res.headersSent) {
    res.write(`data: ${JSON.stringify({ type: ParserEventType.ERROR, message: error })}\n\n`);
    res.end();
    return;
  }

  sendStandardError(res, status, error);
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

    const chatResult = await getOrCreateChat(userId, body.chatId, {
      title: body.title,
      description: body.description,
      visibility: body.visibility
    });

    if (chatResult.error) {
      sendError(res, chatResult.status || HttpStatus.INTERNAL_SERVER_ERROR, chatResult.error);
      return;
    }

    const { chatId, isNewChat } = chatResult;

    const userMessageId = await saveMessage(chatId, userId, MessageRole.User, body.content);
    const assistantMessageId = nanoid(32);

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

    const workflow = await createWorkflow(userId, chatId, {
      userRequest: body.content,
    });

    await advanceWorkflow(workflow, body.content);

    const preVerifiedDeps = workflow.context.intent?.features || [];

    const parser = createStreamParser();
    let fullRawResponse = '';
    const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
    const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
    let streamTimer: NodeJS.Timeout | null = null;
    let currentFilePath: string | undefined;
    let isFirstFileChunk = false;

    const abortController = new AbortController();
    streamTimer = setTimeout(() => {
      logger.warn({ chatId }, 'Stream timeout reached');
      abortController.abort();
    }, MAX_STREAM_DURATION_MS);

    req.on('close', () => {
      logger.info({ chatId }, 'Connection closed by client');
      if (streamTimer) clearTimeout(streamTimer);
      abortController.abort();
    });

    try {
      const stream = streamResponse(decryptedApiKey, body.content, abortController.signal, preVerifiedDeps);

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        if (fullRawResponse.length + chunk.length > MAX_RESPONSE_SIZE) {
          throw new Error('Response size exceeded maximum limit');
        }
        fullRawResponse += chunk;
        const events = parser.process(chunk);

        for (const event of events) {
          try {
            switch (event.type) {
              case ParserEventType.SANDBOX_START:
                if (!workflow.sandboxId) {
                  await ensureSandbox(workflow);
                }
                break;

              case ParserEventType.FILE_START:
                if (!workflow.sandboxId) await ensureSandbox(workflow);
                currentFilePath = event.path;
                isFirstFileChunk = true;
                await prepareSandboxFile(workflow.sandboxId!, currentFilePath);
                break;

              case ParserEventType.FILE_CONTENT:
                if (!workflow.sandboxId || !currentFilePath) break;
                await handleFileContent(workflow.sandboxId, currentFilePath, event.content, isFirstFileChunk);
                if (isFirstFileChunk) isFirstFileChunk = false;
                break;

              case ParserEventType.FILE_END:
                currentFilePath = undefined;
                break;

              case ParserEventType.SANDBOX_END:
                if (workflow.sandboxId) {
                  await flushSandbox(workflow.sandboxId).catch((err: unknown) =>
                    logger.error(ensureError(err), `Flush failed during SANDBOX_END: ${workflow.sandboxId}`)
                  );
                }
                break;

              case ParserEventType.INSTALL_START:
                break;

              case ParserEventType.INSTALL_CONTENT: {
                if (!workflow.sandboxId) await ensureSandbox(workflow);

                const rawDependencies = event.dependencies || [];
                if (rawDependencies.length > 0) {
                    await advanceWorkflow(workflow, rawDependencies);
                }
                break;
              }

              case ParserEventType.INSTALL_END:
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
              if (!workflow.sandboxId) {
                logger.error('[Chat] FILE_START in flush without active sandbox');
                break;
              }
              currentFilePath = event.path;
              isFirstFileChunk = true;
              await prepareSandboxFile(workflow.sandboxId, currentFilePath);
              break;

            case ParserEventType.FILE_CONTENT:
              if (workflow.sandboxId && currentFilePath) {
                await handleFileContent(workflow.sandboxId, currentFilePath, event.content, isFirstFileChunk);
                if (isFirstFileChunk) isFirstFileChunk = false;
              }
              break;

            case ParserEventType.FILE_END:
              currentFilePath = undefined;
              break;

            case ParserEventType.SANDBOX_END:
              if (workflow.sandboxId) {
                await flushSandbox(workflow.sandboxId).catch((err) =>
                  logger.error(ensureError(err), `Flush failed during SANDBOX_END: ${workflow.sandboxId}`)
                );
                void backupSandbox(workflow.sandboxId).catch((err) =>
                  logger.error(ensureError(err), `Backup failed during SANDBOX_END: ${workflow.sandboxId}`)
                );
              }
              break;
          }
        } catch (sandboxError) {
          logger.error(ensureError(sandboxError), 'Final sandbox operation failed');
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }


      if (workflow.sandboxId) {
        await flushSandbox(workflow.sandboxId, true).catch((err: unknown) =>
          logger.error(ensureError(err), `Final flush failed for sandbox: ${workflow.sandboxId}`)
        );

        void buildAndUploadUnified(workflow.sandboxId)
          .then((buildResult: any) => {
            if (buildResult.success) {
              logger.info({ sandboxId: workflow.sandboxId, url: buildResult.previewUrl }, '[Chat] Build successful');
            } else {
              logger.error({
                sandboxId: workflow.sandboxId,
                chatId,
                error: buildResult.error,
              }, 'Build did not complete successfully');
            }
          })
          .catch((err: unknown) =>
            logger.error(ensureError(err), `Build and preview upload failed for sandbox: ${workflow.sandboxId}`)
          );
      } else {
        logger.warn({ chatId }, '[Chat] No sandbox ID available, skipping build');
      }

      await saveMessage(chatId, userId, MessageRole.Assistant, fullRawResponse, assistantMessageId);
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (streamError) {
      const error = ensureError(streamError);
      if (workflow.sandboxId) {
        await cleanupSandbox(workflow.sandboxId).catch((err: unknown) =>
          logger.error(ensureError(err), `Cleanup failed after stream error: ${workflow.sandboxId}`)
        );
      }

      logger.error(error, 'Streaming error');

      res.write(`data: ${JSON.stringify({
        type: ParserEventType.ERROR,
        message: 'Stream processing failed'
      })}\n\n`);

      res.end();

      try {
        await saveMessage(chatId, userId, MessageRole.Assistant, fullRawResponse || `Error: ${error.message}`, assistantMessageId);
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

export async function deleteChat(
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

    const [chatData] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatData) {
      sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }

    if (chatData.userId !== userId) {
      sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    const activeSandboxId = await getActiveSandbox(chatId);
    if (activeSandboxId) {
      await cleanupSandbox(activeSandboxId).catch((err) =>
        logger.error({ err, chatId }, 'Failed to cleanup sandbox during chat deletion')
      );
    }

    const s3Prefix = buildS3Key(userId, chatId);
    await deleteFolder(s3Prefix).catch((err: unknown) =>
      logger.error({ err, chatId, s3Prefix }, 'Failed to cleanup S3 storage during chat deletion')
    );
    await db.delete(chat).where(eq(chat.id, chatId));

    sendSuccess(res, HttpStatus.OK, 'Chat deleted successfully');
  } catch (error) {
    logger.error(ensureError(error), 'deleteChat error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}