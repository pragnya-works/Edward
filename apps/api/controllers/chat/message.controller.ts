import type { Response } from "express";
import {
  MessageRole,
  createRunWithUserLimit,
  count,
  db,
  eq,
  inArray,
  message as messageTable,
  run as runTable,
  updateRun,
} from "@edward/auth";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { getUserWithApiKey } from "../../services/apiKey.service.js";
import { decrypt } from "../../utils/encryption.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { logger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import {
  getOrCreateChat,
  saveAttachments,
  saveMessage,
} from "../../services/chat.service.js";
import {
  createWorkflow,
  advanceWorkflow,
} from "../../services/planning/workflowEngine.js";
import { buildConversationMessages, type LlmChatMessage } from "../../lib/llm/context.js";
import { ChatAction } from "../../services/planning/schemas.js";
import { modelSupportsVision } from "@edward/shared/schema";
import { ParserEventType } from "@edward/shared/stream-events";
import { nanoid } from "nanoid";
import {
  buildMultimodalContentForLLM,
  parseMultimodalContent,
  toImageAttachments,
} from "./multimodal.utils.js";
import { sendStreamError } from "./shared.utils.js";
import { enqueueAgentRunJob } from "../../services/queue/enqueue.js";
import { createAgentRunMetadata } from "../../services/runs/runMetadata.js";
import { streamRunEventsFromPersistence } from "./runEventStream.utils.js";
import {
  MAX_ACTIVE_RUNS_PER_USER,
  MAX_AGENT_QUEUE_DEPTH,
} from "../../utils/sharedConstants.js";

async function cleanupUnqueuedUserMessage(messageId: string): Promise<void> {
  await db
    .delete(messageTable)
    .where(eq(messageTable.id, messageId))
    .catch((cleanupError: unknown) =>
      logger.warn(
        { cleanupError, messageId },
        "Failed to cleanup user message after run admission failure",
      ),
    );
}

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  let userMessageId: string | null = null;
  let runId: string | null = null;

  try {
    const userId = getAuthenticatedUserId(req);
    const body = req.body;

    const [activeRunCountResult] = await db
      .select({ value: count() })
      .from(runTable)
      .where(inArray(runTable.status, ["queued", "running"]));
    const activeRunDepth = Number(activeRunCountResult?.value ?? 0);
    logger.debug(
      { activeRunDepth, metric: "active_run_depth" },
      "Current active run depth",
    );
    if (activeRunDepth >= MAX_AGENT_QUEUE_DEPTH) {
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        "System is currently under high load. Please retry in a moment.",
      );
      return;
    }

    const dynamicUserRunLimit =
      activeRunDepth >= Math.floor(MAX_AGENT_QUEUE_DEPTH * 0.8)
        ? 1
        : MAX_ACTIVE_RUNS_PER_USER;

    let preferredModel: string | undefined;
    try {
      const userData = await getUserWithApiKey(userId);
      if (!userData || !userData.apiKey) {
        sendStreamError(
          res,
          HttpStatus.BAD_REQUEST,
          "No API key found. Please configure your settings.",
        );
        return;
      }

      // Validate key decryption before queueing a durable run.
      decrypt(userData.apiKey);
      preferredModel = userData.preferredModel || undefined;
    } catch (err) {
      const error = ensureError(err);
      logger.error(error, "Failed to retrieve or decrypt API key");
      sendStreamError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Error processing API key. Please re-save it in settings.",
      );
      return;
    }

    const chatResult = await getOrCreateChat(userId, body.chatId, {
      title: body.title,
      description: body.description,
      visibility: body.visibility,
    });

    if (chatResult.error) {
      sendStreamError(
        res,
        chatResult.status || HttpStatus.INTERNAL_SERVER_ERROR,
        chatResult.error,
      );
      return;
    }

    const { chatId, isNewChat } = chatResult;
    const isFollowUp = !isNewChat;
    let intent: (typeof ChatAction)[keyof typeof ChatAction] | undefined =
      isNewChat ? ChatAction.GENERATE : undefined;

    const parsedContent = await parseMultimodalContent(body.content);
    const selectedModel = body.model || preferredModel;

    if (parsedContent.hasImages && selectedModel && !modelSupportsVision(selectedModel)) {
      sendStreamError(
        res,
        HttpStatus.BAD_REQUEST,
        `The selected model (${selectedModel}) does not support images. Please select a vision-capable model.`,
      );
      return;
    }

    userMessageId = await saveMessage(
      chatId,
      userId,
      MessageRole.User,
      parsedContent.textContent || "[Image message]",
    );

    if (parsedContent.hasImages) {
      const imageAttachments = toImageAttachments(parsedContent.images);
      await saveAttachments(userMessageId, imageAttachments).catch((err) => {
        logger.error(
          { err, messageId: userMessageId },
          "Failed to save image attachments (non-fatal)",
        );
      });
    }

    const assistantMessageId = nanoid(32);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(
      `data: ${JSON.stringify({
        type: ParserEventType.META,
        chatId,
        userMessageId,
        assistantMessageId,
        isNewChat,
        intent,
      })}\n\n`,
    );

    const workflow = await createWorkflow(userId, chatId, {
      userRequest: parsedContent.textContent || "[Image message]",
      mode: intent,
    });

    let historyMessages: LlmChatMessage[] = [];
    let projectContext = "";
    if (isFollowUp) {
      const ctx = await buildConversationMessages(chatId, {
        excludeMessageIds: userMessageId ? [userMessageId] : [],
      });
      historyMessages = ctx.history;
      projectContext = ctx.projectContext;
    }

    await advanceWorkflow(
      workflow,
      parsedContent.textContent || "[Image message]",
    );

    if (!intent && workflow.context.intent?.action) {
      intent = workflow.context.intent.action;
    }

    const preVerifiedDeps = workflow.context.intent?.recommendedPackages || [];
    const userMultimodalContent = parsedContent.hasImages
      ? buildMultimodalContentForLLM(
          parsedContent.textContent,
          parsedContent.images,
        )
      : parsedContent.textContent;

    const runMetadata = createAgentRunMetadata({
      workflow,
      userContent: userMultimodalContent,
      userTextContent: parsedContent.textContent,
      preVerifiedDeps,
      isFollowUp,
      intent: intent ?? ChatAction.GENERATE,
      historyMessages,
      projectContext,
      model: selectedModel,
    });

    if (!userMessageId) {
      throw new Error("User message was not persisted");
    }

    const run = await createRunWithUserLimit(
      {
        chatId,
        userId,
        userMessageId,
        assistantMessageId,
        model: selectedModel,
        intent: intent ?? ChatAction.GENERATE,
        metadata: runMetadata as unknown as Record<string, unknown>,
      },
      dynamicUserRunLimit,
    );

    if (!run) {
      await cleanupUnqueuedUserMessage(userMessageId);
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        `Too many active runs for your account. Limit=${dynamicUserRunLimit}. Please wait for an ongoing run to finish.`,
      );
      return;
    }
    runId = run.id;

    // Emit run-bound meta as soon as run is created so clients can
    // reconnect/resume even if the transport drops before persisted events arrive.
    res.write(
      `data: ${JSON.stringify({
        type: ParserEventType.META,
        chatId,
        userMessageId,
        assistantMessageId,
        isNewChat,
        runId: run.id,
        intent,
      })}\n\n`,
    );

    try {
      await enqueueAgentRunJob({ runId: run.id });
    } catch (enqueueError) {
      await updateRun(run.id, {
        status: "failed",
        state: "FAILED",
        errorMessage: ensureError(enqueueError).message,
        completedAt: new Date(),
      }).catch(() => {});

      sendStreamError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to enqueue agent run",
      );
      return;
    }

    logger.info(
      { runId: run.id, chatId, userId, activeRunDepth, dynamicUserRunLimit },
      "Queued durable agent run",
    );

    await streamRunEventsFromPersistence({
      req,
      res,
      runId: run.id,
    });
  } catch (error) {
    if (userMessageId && !runId) {
      await cleanupUnqueuedUserMessage(userMessageId);
    }
    logger.error(ensureError(error), "unifiedSendMessage error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
