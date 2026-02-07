import type { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { ParserEventType, type ParserEvent } from '../../schemas/chat.schema.js';
import { createStreamParser } from '../../lib/llm/parser.js';
import { streamResponse } from '../../lib/llm/response.js';
import { advanceWorkflow, ensureSandbox } from '../../services/planning/workflowEngine.js';
import { cleanupSandbox } from '../../services/sandbox/lifecycle/cleanup.js';
import { addSandboxPackages } from '../../services/sandbox/lifecycle/packages.js';
import { prepareSandboxFile, writeSandboxFile, flushSandbox } from '../../services/sandbox/writes.sandbox.js';
import { enqueueBuildJob } from '../../services/queue/enqueue.js';
import { saveMessage } from '../../services/chat.service.js';
import { executeSandboxCommand } from '../../services/sandbox/command.sandbox.js';
import { getSandboxState } from '../../services/sandbox/state.sandbox.js';
import { normalizeFramework } from '../../services/sandbox/templates/template.registry.js';
import { ensureError } from '../../utils/error.js';
import { logger } from '../../utils/logger.js';
import { MessageRole } from '@edward/auth';
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from '../../services/planning/schemas.js';
import { resolveDependencies, suggestAlternatives } from '../../services/planning/resolvers/dependency.resolver.js';
import { reflectPlan } from '../../services/planning/analyzers/planAnalyzer.js';
import { appendPlanDecision, markPlanStepInProgress, updatePlanStepStatus, createFallbackPlan } from '../../services/planning/workflow/plan.js';
import { saveWorkflow } from '../../services/planning/workflow/store.js';
import { validateGeneratedOutput } from '../../services/planning/validators/postgenValidator.js';

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
const MAX_AGENT_TURNS = 5;

interface CommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
}

interface TurnResult {
  rawResponse: string;
  commands: Array<{ command: string; args: string[] }>;
}

export async function processLLMStream(
  stream: AsyncIterable<string>,
  parser: ReturnType<typeof createStreamParser>,
  sendSSE: (event: ParserEvent) => void,
  abortSignal?: AbortSignal,
): Promise<TurnResult> {
  let rawResponse = '';
  const commands: TurnResult['commands'] = [];

  for await (const text of stream) {
    if (abortSignal?.aborted) break;
    if (!text) continue;

    rawResponse += text;

    for (const event of parser.process(text)) {
      sendSSE(event);
      if (event.type === ParserEventType.COMMAND && 'command' in event) {
        commands.push({ command: event.command, args: event.args ?? [] });
      }
    }
  }

  for (const event of parser.flush()) {
    sendSSE(event);
    if (event.type === ParserEventType.COMMAND && 'command' in event) {
      commands.push({ command: event.command, args: event.args ?? [] });
    }
  }

  return { rawResponse, commands };
}

export async function executeCommands(
  sandboxId: string,
  commands: TurnResult['commands'],
): Promise<CommandResult[]> {
  return Promise.all(
    commands.map(async (cmd) => {
      try {
        const r = await executeSandboxCommand(sandboxId, cmd);
        return { ...cmd, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
      } catch (err) {
        return {
          ...cmd,
          stdout: '',
          stderr: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }),
  );
}

export function formatCommandResults(results: CommandResult[]): string {
  return results
    .map((r) => {
      let out = `$ ${r.command} ${r.args.join(' ')}\n${r.stdout}`;
      if (r.stderr) out += `\nSTDERR: ${r.stderr}`;
      return out;
    })
    .join('\n---\n');
}

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
  isFollowUp?: boolean;
  intent?: ChatActionType;
  conversationContext?: string;
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
    isFollowUp = false,
    intent = ChatAction.GENERATE,
    conversationContext,
  } = params;

  let fullRawResponse = '';
  let committedMessageContent: string | null = null;
  let currentFilePath: string | undefined;
  let isFirstFileChunk = true;
  const generatedFiles = new Map<string, string>();
  const declaredPackages: string[] = [];

  if (!workflow.context.plan && !isFollowUp) {
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
      const err = error instanceof Error ? error.message : String(error);
      logger.error({ error: err, userId, chatId }, 'Failed to reflect plan on decision point');
    }
  }

  const abortController = new AbortController();
  const streamTimer = setTimeout(() => {
    logger.warn({ chatId }, 'Stream timeout reached');
    abortController.abort();
  }, MAX_STREAM_DURATION_MS);

  req.on('close', () => {
    logger.info({ chatId }, 'Connection closed by client');
    if (streamTimer) clearTimeout(streamTimer);
    abortController.abort();
  });

  try {
    let framework: Framework | undefined = workflow.context.framework || workflow.context.intent?.suggestedFramework;
    const complexity = workflow.context.intent?.complexity;
    const mode = intent === ChatAction.FIX ? 'fix' : intent === ChatAction.EDIT ? 'edit' : 'generate';

    const fullUserContent = isFollowUp && conversationContext
      ? `${conversationContext}\n\nUSER REQUEST: ${userContent}`
      : userContent;

    if (!workflow.sandboxId) {
      await ensureSandbox(workflow, framework, isFollowUp);
    }

    if (!framework && workflow.sandboxId) {
      const sandboxState = await getSandboxState(workflow.sandboxId);
      if (sandboxState?.scaffoldedFramework) {
        const recovered = normalizeFramework(sandboxState.scaffoldedFramework);
        if (recovered) {
          framework = recovered;
          workflow.context.framework = framework;
          await saveWorkflow(workflow);
        }
      }
    }

    let agentUserContent = fullUserContent;
    let agentTurn = 0;

    agentLoop: while (agentTurn < MAX_AGENT_TURNS) {
      agentTurn++;
      const parser = createStreamParser();
      const commandResultsThisTurn: CommandResult[] = [];
      let turnRawResponse = '';
      currentFilePath = undefined;
      isFirstFileChunk = true;

    const stream = streamResponse(
      decryptedApiKey,
      agentUserContent,
      abortController.signal,
      preVerifiedDeps,
      undefined,
      framework,
      complexity,
      mode,
    );

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;

      if (fullRawResponse.length + chunk.length > MAX_RESPONSE_SIZE) {
        throw new Error('Response size exceeded maximum limit');
      }
      fullRawResponse += chunk;
      turnRawResponse += chunk;
      const events = parser.process(chunk);

      for (const event of events) {
        let handled = false;
        try {
          switch (event.type) {
            case ParserEventType.SANDBOX_START:
              if (!workflow.sandboxId) {
                await ensureSandbox(workflow, undefined, isFollowUp);
              }
              if (workflow.context.plan) {
                workflow.context.plan = markPlanStepInProgress(workflow.context.plan, 'Generate');
                await saveWorkflow(workflow);
                emitPlanUpdate(res, workflow.context.plan);
              }
              break;

            case ParserEventType.FILE_START:
              if (!workflow.sandboxId) await ensureSandbox(workflow, undefined, isFollowUp);
              currentFilePath = event.path;
              isFirstFileChunk = true;
              await prepareSandboxFile(workflow.sandboxId!, currentFilePath);
              break;

            case ParserEventType.FILE_CONTENT:
              if (!workflow.sandboxId || !currentFilePath) break;
              await handleFileContent(workflow.sandboxId, currentFilePath, event.content, isFirstFileChunk);
              generatedFiles.set(currentFilePath, (generatedFiles.get(currentFilePath) || '') + event.content);
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

            case ParserEventType.INSTALL_CONTENT: {
              if (event.dependencies) {
                declaredPackages.push(...event.dependencies);
              }
              if (event.framework) {
                const normalized = normalizeFramework(event.framework);
                if (normalized) {
                  workflow.context.framework = normalized;
                }
              }
              if (!workflow.sandboxId) {
                await ensureSandbox(workflow, workflow.context.framework, isFollowUp);
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

            case ParserEventType.COMMAND: {
              if (!workflow.sandboxId) await ensureSandbox(workflow, undefined, isFollowUp);
              const { command: cmd, args: cmdArgs = [] } = event;
              try {
                const result = await executeSandboxCommand(
                  workflow.sandboxId!,
                  { command: cmd, args: cmdArgs }
                );
                commandResultsThisTurn.push({
                  command: cmd,
                  args: cmdArgs,
                  stdout: result.stdout ?? '',
                  stderr: result.stderr ?? '',
                });
                res.write(`data: ${JSON.stringify({
                  type: ParserEventType.COMMAND,
                  command: cmd,
                  args: cmdArgs,
                  ...result
                })}\n\n`);
              } catch (cmdError) {
                const err = ensureError(cmdError);
                commandResultsThisTurn.push({
                  command: cmd,
                  args: cmdArgs,
                  stdout: '',
                  stderr: `Command failed: ${err.message}`,
                });
                res.write(`data: ${JSON.stringify({
                  type: ParserEventType.ERROR,
                  message: `Command failed: ${err.message}`
                })}\n\n`);
              }
              handled = true;
              break;
            }
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

        if (!handled) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
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
              generatedFiles.set(currentFilePath, (generatedFiles.get(currentFilePath) || '') + event.content);
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

    if (commandResultsThisTurn.length > 0 && agentTurn < MAX_AGENT_TURNS && !abortController.signal.aborted) {
      const formattedResults = formatCommandResults(commandResultsThisTurn);
      const prevSummary = turnRawResponse.length > 4000
        ? turnRawResponse.slice(0, 4000) + '\n...[truncated]'
        : turnRawResponse;
      agentUserContent = `ORIGINAL REQUEST:\n${fullUserContent}\n\nYOUR PREVIOUS RESPONSE:\n${prevSummary}\n\nCOMMAND RESULTS:\n${formattedResults}\n\nContinue with the task. If you wrote fixes, verify by running the build. If you need more information, use <edward_command>. Do not stop until the task is complete.`;
      logger.info({ chatId, turn: agentTurn, commandCount: commandResultsThisTurn.length }, 'Agent loop: continuing with command results');
      continue agentLoop;
    }

    break;
    }

    committedMessageContent = fullRawResponse;
    await saveMessage(chatId, userId, MessageRole.Assistant, fullRawResponse, assistantMessageId);

    if (workflow.sandboxId) {
      if (generatedFiles.size > 0) {
        const validation = validateGeneratedOutput({
          framework: workflow.context.framework,
          files: generatedFiles,
          declaredPackages,
          mode,
        });
        if (!validation.valid) {
          const errorViolations = validation.violations.filter(v => v.severity === 'error');
          logger.warn({ violations: errorViolations, chatId }, 'Post-gen validation found build-breaking issues');
          for (const violation of validation.violations) {
            res.write(`data: ${JSON.stringify({
              type: ParserEventType.ERROR,
              message: `[Validation] ${violation.message}`,
            })}\n\n`);
          }
        }
      }

      await flushSandbox(workflow.sandboxId, true).catch((err: unknown) =>
        logger.error(ensureError(err), `Final flush failed for sandbox: ${workflow.sandboxId}`)
      );

      try {
        await enqueueBuildJob({ sandboxId: workflow.sandboxId, userId, chatId, messageId: assistantMessageId });
        if (workflow.context.plan) {
          workflow.context.plan = markPlanStepInProgress(workflow.context.plan, 'Validate');
          await saveWorkflow(workflow);
          emitPlanUpdate(res, workflow.context.plan);
        }
      } catch (queueErr) {
        logger.error(ensureError(queueErr), `Failed to enqueue build job for sandbox: ${workflow.sandboxId}`);
        await updatePlanWithDecision('Failed to enqueue build job; build may not complete.');
      }
      // Backup is enqueued by the worker AFTER the build completes,
      // ensuring the backup captures the correct package.json with installed deps.
    } else {
      logger.warn({ chatId }, '[Chat] No sandbox ID available, skipping build');
    }

    if (workflow.context.plan) {
      workflow.context.plan = updatePlanStepStatus(workflow.context.plan, step => step.title.toLowerCase().includes('generate'), 'done');
      await saveWorkflow(workflow);
      emitPlanUpdate(res, workflow.context.plan);
    }

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
      if (committedMessageContent === null) {
        await saveMessage(
          chatId,
          userId,
          MessageRole.Assistant,
          fullRawResponse || `Error: ${error.message}`,
          assistantMessageId
        );
      }
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, 'Failed during error cleanup');
    }
  } finally {
    if (streamTimer) clearTimeout(streamTimer);
  }
}
