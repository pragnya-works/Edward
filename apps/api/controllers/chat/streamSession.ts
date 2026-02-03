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
import { resolveDependencies, suggestAlternatives } from '../../services/planning/resolvers/dependency.resolver.js';
import { reflectPlan } from '../../services/planning/analyzers/plan.analyzer.js';
import { appendPlanDecision, markPlanStepInProgress, updatePlanStepStatus, createFallbackPlan } from '../../services/planning/workflow/plan.js';
import { saveWorkflow } from '../../services/planning/workflow/store.js';

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

function emitPlanUpdate(res: Response, plan: WorkflowState['context']['plan']): void {
  if (!plan || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: ParserEventType.PLAN_UPDATE, plan })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: ParserEventType.TODO_UPDATE, todos: plan.steps })}\n\n`);
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

  if (!workflow.context.plan) {
    workflow.context.plan = createFallbackPlan();
    await saveWorkflow(workflow);
    emitPlanUpdate(res, workflow.context.plan);
  }

  async function updatePlanWithDecision(decisionContext: string): Promise<void> {
    if (!workflow.context.plan) return;
    try {
      const updated = await reflectPlan(workflow.context.plan, decisionContext, decryptedApiKey);
      workflow.context.plan = appendPlanDecision(updated, decisionContext);
      await saveWorkflow(workflow);
      emitPlanUpdate(res, workflow.context.plan);
    } catch (error) {
      logger.warn({ error, chatId }, 'Failed to reflect plan on decision point');
    }
  }

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
              if (workflow.context.plan) {
                workflow.context.plan = markPlanStepInProgress(workflow.context.plan, 'Generate');
                await saveWorkflow(workflow);
                emitPlanUpdate(res, workflow.context.plan);
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
                if (workflow.context.plan) {
                  workflow.context.plan = markPlanStepInProgress(workflow.context.plan, 'Resolve');
                  await saveWorkflow(workflow);
                  emitPlanUpdate(res, workflow.context.plan);
                }

                const frameworkForResolution = workflow.context.framework || 'vanilla';
                const resolution = await resolveDependencies(rawDependencies, frameworkForResolution);
                const validDeps = resolution.resolved.map(dep => dep.name);

                if (resolution.failed.length > 0) {
                  const failures = resolution.failed.map(dep => dep.name).join(', ');
                  const suggestions = resolution.failed
                    .flatMap(dep => suggestAlternatives(dep.name))
                    .filter(Boolean);

                  const message = `Invalid dependencies detected: ${failures}` + (suggestions.length > 0
                    ? ` (suggested alternatives: ${Array.from(new Set(suggestions)).join(', ')})`
                    : '');

                  await updatePlanWithDecision(`Dependency validation failed: ${message}`);

                  res.write(`data: ${JSON.stringify({
                    type: ParserEventType.ERROR,
                    message
                  })}\n\n`);
                }

                if (resolution.warnings.length > 0) {
                  await updatePlanWithDecision(`Dependency warnings: ${resolution.warnings.join('; ')}`);
                }

                await advanceWorkflow(workflow, rawDependencies);
                if (workflow.sandboxId && validDeps.length > 0) {
                  await addSandboxPackages(workflow.sandboxId, validDeps);
                  if (workflow.context.plan) {
                    workflow.context.plan = updatePlanStepStatus(workflow.context.plan, step => step.title.toLowerCase().includes('resolve'), 'done');
                    await saveWorkflow(workflow);
                    emitPlanUpdate(res, workflow.context.plan);
                  }
                }
              }
              break;
            }

            case ParserEventType.INSTALL_END:
              break;
          }
        } catch (sandboxError) {
          logger.error(ensureError(sandboxError), 'Sandbox operation failed during streaming');
          await updatePlanWithDecision(`Sandbox operation failed during streaming: ${ensureError(sandboxError).message}`);
          res.write(`data: ${JSON.stringify({
            type: ParserEventType.ERROR,
            message: 'Sandbox execution failed'
          })}\n\n`);
          continue;
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
        await updatePlanWithDecision(`Final sandbox operation failed: ${ensureError(sandboxError).message}`);
        continue;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    if (workflow.sandboxId) {
      await flushSandbox(workflow.sandboxId, true).catch((err: unknown) =>
        logger.error(ensureError(err), `Final flush failed for sandbox: ${workflow.sandboxId}`)
      );

      try {
        await enqueueBuildJob({ sandboxId: workflow.sandboxId, userId, chatId });
        if (workflow.context.plan) {
          workflow.context.plan = markPlanStepInProgress(workflow.context.plan, 'Validate');
          await saveWorkflow(workflow);
          emitPlanUpdate(res, workflow.context.plan);
        }
      } catch (queueErr) {
        logger.error(ensureError(queueErr), `Failed to enqueue build job for sandbox: ${workflow.sandboxId}`);
        await updatePlanWithDecision('Failed to enqueue build job; build may not complete.');
      }

      try {
        await enqueueBackupJob({ sandboxId: workflow.sandboxId, userId });
      } catch (backupErr) {
        logger.error(ensureError(backupErr), `Failed to enqueue backup job for sandbox: ${workflow.sandboxId}`);
      }
    } else {
      logger.warn({ chatId }, '[Chat] No sandbox ID available, skipping build');
    }

    if (workflow.context.plan) {
      workflow.context.plan = updatePlanStepStatus(workflow.context.plan, step => step.title.toLowerCase().includes('generate'), 'done');
      await saveWorkflow(workflow);
      emitPlanUpdate(res, workflow.context.plan);
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

    await updatePlanWithDecision(`Streaming error: ${error.message}`);

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
