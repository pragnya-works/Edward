import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { ParserEventType } from "../../schemas/chat.schema.js";
import { createStreamParser } from "../../lib/llm/parser.js";
import { streamResponse } from "../../lib/llm/response.js";
import { ensureSandbox } from "../../services/planning/workflowEngine.js";
import { cleanupSandbox } from "../../services/sandbox/lifecycle/cleanup.js";
import { flushSandbox } from "../../services/sandbox/writes.sandbox.js";
import { enqueueBuildJob } from "../../services/queue/enqueue.js";
import { saveMessage } from "../../services/chat.service.js";
import { getSandboxState } from "../../services/sandbox/state.sandbox.js";
import { normalizeFramework } from "../../services/sandbox/templates/template.registry.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { MessageRole } from "@edward/auth";
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../services/planning/schemas.js";
import { saveWorkflow } from "../../services/planning/workflow/store.js";
import { validateGeneratedOutput } from "../../services/planning/validators/postgenValidator.js";
import {
  MAX_RESPONSE_SIZE,
  MAX_STREAM_DURATION_MS,
  MAX_AGENT_TURNS,
} from "../../utils/sharedConstants.js";

import { safeSSEWrite, sendSSEDone } from "./sse.utils.js";
import { formatCommandResults, type CommandResult } from "./command.utils.js";
import {
  handleParserEvent,
  handleFlushEvents,
  type EventHandlerContext,
} from "./event.handlers.js";

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

function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  commandResults: CommandResult[],
): string {
  const formattedResults = formatCommandResults(commandResults);
  const prevSummary =
    turnRawResponse.length > 4000
      ? turnRawResponse.slice(0, 4000) + "\n...[truncated]"
      : turnRawResponse;

  return `ORIGINAL REQUEST:\n${fullUserContent}\n\nYOUR PREVIOUS RESPONSE:\n${prevSummary}\n\nCOMMAND RESULTS:\n${formattedResults}\n\nContinue with the task. If you wrote fixes, verify by running the build. If you need more information, use <edward_command>. Do not stop until you have completed the request and emitted <edward_done />.`;
}

export async function runStreamSession(
  params: StreamSessionParams,
): Promise<void> {
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

  let fullRawResponse = "";
  let committedMessageContent: string | null = null;
  const generatedFiles = new Map<string, string>();
  const declaredPackages: string[] = [];

  const abortController = new AbortController();
  const streamTimer = setTimeout(() => {
    logger.warn({ chatId }, "Stream timeout reached");
    abortController.abort();
  }, MAX_STREAM_DURATION_MS);

  req.on("close", () => {
    logger.info({ chatId }, "Connection closed by client");
    if (streamTimer) clearTimeout(streamTimer);
    abortController.abort();
  });

  try {
    let framework: Framework | undefined =
      workflow.context.framework || workflow.context.intent?.suggestedFramework;
    const complexity = workflow.context.intent?.complexity;
    const mode =
      intent === ChatAction.FIX
        ? ChatAction.FIX
        : intent === ChatAction.EDIT
          ? ChatAction.EDIT
          : ChatAction.GENERATE;

    const fullUserContent =
      isFollowUp && conversationContext
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
      let turnRawResponse = "";
      let currentFilePath: string | undefined;
      let isFirstFileChunk = true;

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
          throw new Error("Response size exceeded maximum limit");
        }
        fullRawResponse += chunk;
        turnRawResponse += chunk;

        const events = parser.process(chunk);
        for (const event of events) {
          const ctx: EventHandlerContext = {
            workflow,
            res,
            decryptedApiKey,
            userId,
            chatId,
            isFollowUp,
            currentFilePath,
            isFirstFileChunk,
            generatedFiles,
            declaredPackages,
            commandResultsThisTurn,
          };

          const result = await handleParserEvent(ctx, event);
          currentFilePath = result.currentFilePath;
          isFirstFileChunk = result.isFirstFileChunk;

          if (!result.handled) {
            safeSSEWrite(res, `data: ${JSON.stringify(event)}\n\n`);
          }
        }
      }

      if (abortController.signal.aborted) {
        res.end();
        return;
      }
      const flushCtx: EventHandlerContext = {
        workflow,
        res,
        decryptedApiKey,
        userId,
        chatId,
        isFollowUp,
        currentFilePath,
        isFirstFileChunk,
        generatedFiles,
        declaredPackages,
        commandResultsThisTurn,
      };
      await handleFlushEvents(flushCtx, parser.flush());

      if (
        commandResultsThisTurn.length > 0 &&
        agentTurn < MAX_AGENT_TURNS &&
        !abortController.signal.aborted
      ) {
        agentUserContent = buildAgentContinuationPrompt(
          fullUserContent,
          turnRawResponse,
          commandResultsThisTurn,
        );
        logger.info(
          {
            chatId,
            turn: agentTurn,
            commandCount: commandResultsThisTurn.length,
          },
          "Agent loop: continuing with command results",
        );
        continue agentLoop;
      }

      break;
    }

    committedMessageContent = fullRawResponse;
    await saveMessage(
      chatId,
      userId,
      MessageRole.Assistant,
      fullRawResponse,
      assistantMessageId,
    );

    if (workflow.sandboxId) {
      if (generatedFiles.size > 0) {
        const validation = validateGeneratedOutput({
          framework: workflow.context.framework,
          files: generatedFiles,
          declaredPackages,
          mode,
        });
        if (!validation.valid) {
          const errorViolations = validation.violations.filter(
            (v) => v.severity === "error",
          );
          logger.warn(
            { violations: errorViolations, chatId },
            "Post-gen validation found build-breaking issues",
          );
          for (const violation of validation.violations) {
            safeSSEWrite(
              res,
              `data: ${JSON.stringify({
                type: ParserEventType.ERROR,
                message: `[Validation] ${violation.message}`,
              })}\n\n`,
            );
          }
        }
      }

      await flushSandbox(workflow.sandboxId, true).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Final flush failed for sandbox: ${workflow.sandboxId}`,
        ),
      );

      try {
        await enqueueBuildJob({
          sandboxId: workflow.sandboxId,
          userId,
          chatId,
          messageId: assistantMessageId,
          apiKey: decryptedApiKey,
        });
      } catch (queueErr) {
        logger.error(
          ensureError(queueErr),
          `Failed to enqueue build job for sandbox: ${workflow.sandboxId}`,
        );
      }
    } else {
      logger.warn({ chatId }, "[Chat] No sandbox ID available, skipping build");
    }

    sendSSEDone(res);
  } catch (streamError) {
    const error = ensureError(streamError);
    if (workflow.sandboxId) {
      await cleanupSandbox(workflow.sandboxId).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Cleanup failed after stream error: ${workflow.sandboxId}`,
        ),
      );
    }

    logger.error(error, "Streaming error");

    safeSSEWrite(
      res,
      `data: ${JSON.stringify({
        type: ParserEventType.ERROR,
        message: "Stream processing failed",
      })}\n\n`,
    );

    if (!res.writableEnded) {
      res.end();
    }

    try {
      if (committedMessageContent === null) {
        await saveMessage(
          chatId,
          userId,
          MessageRole.Assistant,
          fullRawResponse || `Error: ${error.message}`,
          assistantMessageId,
        );
      }
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, "Failed during error cleanup");
    }
  } finally {
    if (streamTimer) clearTimeout(streamTimer);
  }
}
