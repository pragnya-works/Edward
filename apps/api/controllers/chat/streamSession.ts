import type { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { ParserEventType } from '../../schemas/chat.schema.js';
import { createStreamParser } from '../../lib/llm/parser.js';
import { streamResponse } from '../../lib/llm/response.js';
import { advanceWorkflow, ensureSandbox } from '../../services/planning/workflowEngine.js';
import { cleanupSandbox } from '../../services/sandbox/lifecycle/cleanup.js';
import { addSandboxPackages } from '../../services/sandbox/lifecycle/packages.js';
import { prepareSandboxFile, writeSandboxFile, flushSandbox } from '../../services/sandbox/writes.sandbox.js';
import { enqueueBuildJob, enqueueBackupJob } from '../../services/queue/enqueue.js';
import { saveMessage } from '../../services/chat.service.js';
import { normalizeFramework } from '../../services/sandbox/templates/template.registry.js';
import { ensureError } from '../../utils/error.js';
import { logger } from '../../utils/logger.js';
import { MessageRole } from '@edward/auth';
import type { WorkflowState } from '../../services/planning/schemas.js';

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;

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

export interface StreamSessionParams {
  req: AuthenticatedRequest;
  res: Response;
  workflow: WorkflowState;
  userId: string;
  chatId: string;
  decryptedApiKey: string;
  userContent: string;
  assistantMessageId: string;
  preVerifiedDeps: string[];
}

export async function runStreamSession(params: StreamSessionParams): Promise<void> {
  const {
    req,
    res,
    workflow,
    userId,
    chatId,
    decryptedApiKey,
    userContent,
    assistantMessageId,
    preVerifiedDeps,
  } = params;

  const parser = createStreamParser();
  let fullRawResponse = '';
  let currentFilePath: string | undefined;
  let isFirstFileChunk = false;
  let streamTimer: NodeJS.Timeout | null = null;

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
    const framework = workflow.context.framework;
    const stream = streamResponse(
      decryptedApiKey,
      userContent,
      abortController.signal,
      preVerifiedDeps,
      undefined,
      framework,
    );

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
              if (event.framework) {
                const normalized = normalizeFramework(event.framework);
                if (normalized) {
                  workflow.context.framework = normalized;
                }
              }
              if (!workflow.sandboxId) {
                await ensureSandbox(workflow, workflow.context.framework);
              }

              const rawDependencies = event.dependencies || [];
              if (rawDependencies.length > 0) {
                await advanceWorkflow(workflow, rawDependencies);
                if (workflow.sandboxId) {
                  await addSandboxPackages(workflow.sandboxId, rawDependencies);
                }
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
              await flushSandbox(workflow.sandboxId).catch((err: unknown) =>
                logger.error(ensureError(err), `Flush failed during SANDBOX_END: ${workflow.sandboxId}`)
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

      try {
        await enqueueBuildJob({ sandboxId: workflow.sandboxId, userId, chatId });
      } catch (queueErr) {
        logger.error(ensureError(queueErr), `Failed to enqueue build job for sandbox: ${workflow.sandboxId}`);
      }

      try {
        await enqueueBackupJob({ sandboxId: workflow.sandboxId, userId });
      } catch (backupErr) {
        logger.error(ensureError(backupErr), `Failed to enqueue backup job for sandbox: ${workflow.sandboxId}`);
      }
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
  } finally {
    if (streamTimer) clearTimeout(streamTimer);
  }
}
