import type { Response } from "express";
import {
  MessageRole,
} from "@edward/auth";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { getRequestId } from "../../middleware/securityTelemetry.js";
import { getUserWithApiKey } from "../apiKey.service.js";
import { decrypt } from "../../utils/encryption.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { logger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import {
  getOrCreateChat,
  saveAttachments,
  saveMessage,
} from "../chat.service.js";
import { deriveInitialChatMetadata } from "../chatMeta.service.js";
import {
  createWorkflow,
  advanceWorkflow,
} from "../planning/workflow/engine.js";
import { ChatAction } from "../planning/schemas.js";
import { modelSupportsVision } from "@edward/shared/schema";
import { ParserEventType } from "@edward/shared/streamEvents";
import { nanoid } from "nanoid";
import {
  buildMultimodalContentForLLM,
  parseMultimodalContent,
  toImageAttachments,
} from "../multimodal-utils/service.js";
import { sendStreamError } from "../../utils/streamError.js";
import { createAgentRunMetadata } from "./runMetadata.js";
import { streamRunEventsFromPersistence } from "../run-event-stream-utils/service.js";
import {
  createAdmittedRun,
  enqueueAdmittedRun,
  getRunAdmissionWindow,
} from "./runAdmission.service.js";
import {
  cleanupUnqueuedUserMessage,
  resolveRetryTargets,
} from "./messageOrchestrator.helpers.js";

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  let userMessageId: string | null = null;
  let runId: string | null = null;

  try {
    const userId = getAuthenticatedUserId(req);
    const body = req.body;
    const traceId = getRequestId(req);

    const admissionWindow = await getRunAdmissionWindow();
    const activeRunDepth = admissionWindow.activeRunDepth;
    logger.debug(
      { activeRunDepth, metric: "active_run_depth" },
      "Current active run depth",
    );
    if (admissionWindow.overloaded) {
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        "System is currently under high load. Please retry in a moment.",
      );
      return;
    }

    const userRunLimit = admissionWindow.userRunLimit;

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

    const parsedContent = await parseMultimodalContent(body.content);
    const seededMetadata = deriveInitialChatMetadata({
      userTextContent: parsedContent.textContent,
      hasImages: parsedContent.hasImages,
    });
    const initialTitle = body.title?.trim() || seededMetadata.title;
    const initialDescription =
      body.description?.trim() || seededMetadata.description;

    const chatResult = await getOrCreateChat(userId, body.chatId, {
      title: initialTitle,
      description: initialDescription,
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

    const retryTargets = await resolveRetryTargets(userId, chatId, body);

    const selectedModel = body.model || preferredModel;

    if (parsedContent.hasImages && selectedModel && !modelSupportsVision(selectedModel)) {
      sendStreamError(
        res,
        HttpStatus.BAD_REQUEST,
        `The selected model (${selectedModel}) does not support images. Please select a vision-capable model.`,
      );
      return;
    }

    if (retryTargets.userMessageId) {
      userMessageId = retryTargets.userMessageId;
    } else {
      userMessageId = await saveMessage(
        chatId,
        userId,
        MessageRole.User,
        parsedContent.textContent || "[Image message]",
      );
    }

    const isRetryingExistingUserMessage = Boolean(retryTargets.userMessageId);

    if (parsedContent.hasImages && !isRetryingExistingUserMessage) {
      const imageAttachments = toImageAttachments(parsedContent.images);
      await saveAttachments(userMessageId, imageAttachments).catch((err) => {
        logger.error(
          { err, messageId: userMessageId },
          "Failed to save image attachments (non-fatal)",
        );
      });
    }

    const assistantMessageId = retryTargets.assistantMessageId ?? nanoid(32);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (isResponseWritable(res)) {
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
    }

    const workflow = await createWorkflow(userId, chatId, {
      userRequest: parsedContent.textContent || "[Image message]",
      mode: intent,
    });

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
      model: selectedModel,
      traceId,
    });

    if (!userMessageId) {
      throw new Error("User message was not persisted");
    }

    const admissionResult = await createAdmittedRun({
      chatId,
      userId,
      userMessageId,
      assistantMessageId,
      metadata: runMetadata as unknown as Record<string, unknown>,
      userRunLimit,
    });

    const run = admissionResult.run;

    if (!run) {
      await cleanupUnqueuedUserMessage(userMessageId);
      const rejectionMessage =
        admissionResult.rejectedBy === "global_limit"
          ? "System is currently under high load. Please retry in a moment."
          : admissionResult.rejectedBy === "chat_limit"
            ? "This chat already has an active run. Please wait for it to finish before sending another message."
            : `Too many active runs for your account. Limit=${userRunLimit}. Please wait for an ongoing run to finish.`;
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        rejectionMessage,
      );
      return;
    }
    runId = run.id;

    if (isResponseWritable(res)) {
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
    }

    const enqueueResult = await enqueueAdmittedRun(run.id);
    if (!enqueueResult.queued) {
      sendStreamError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to enqueue agent run",
      );
      return;
    }

    logger.info(
      { runId: run.id, chatId, userId, activeRunDepth, userRunLimit },
      "Queued durable agent run",
    );

    if (!isResponseWritable(res)) {
      logger.info(
        { runId: run.id, chatId, userId },
        "Client disconnected before run stream handoff; run continues in background",
      );
      return;
    }

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

function isResponseWritable(res: Response): boolean {
  return !res.writableEnded && res.writable;
}
