import type { Response } from "express";
import { MessageRole } from "@edward/auth";
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
import {
  acquireUserSlot,
  releaseUserSlot,
} from "../../services/concurrency.service.js";
import { runStreamSession } from "./streamSession.js";
import { buildConversationMessages, type LlmChatMessage } from "../../lib/llm/context.js";
import { ChatAction } from "../../services/planning/schemas.js";
import { modelSupportsVision } from "@edward/shared/schema";
import { nanoid } from "nanoid";
import { ParserEventType } from "../../schemas/chat.schema.js";
import {
  buildMultimodalContentForLLM,
  parseMultimodalContent,
  toImageAttachments,
} from "./multimodal.utils.js";
import { sendStreamError } from "./shared.utils.js";

export async function unifiedSendMessage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  let slotAcquired = false;
  let userId = "";

  try {
    userId = getAuthenticatedUserId(req);
    const body = req.body;

    slotAcquired = await acquireUserSlot(userId);
    if (!slotAcquired) {
      sendStreamError(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        "Too many concurrent requests. Please wait and try again.",
      );
      return;
    }

    let decryptedApiKey: string;
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
      decryptedApiKey = decrypt(userData.apiKey);
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
    if (parsedContent.hasImages && selectedModel) {
      if (!modelSupportsVision(selectedModel)) {
        sendStreamError(
          res,
          HttpStatus.BAD_REQUEST,
          `The selected model (${selectedModel}) does not support images. Please select a vision-capable model.`,
        );
        return;
      }
    }

    const userMessageId = await saveMessage(
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
      const ctx = await buildConversationMessages(chatId);
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

    await runStreamSession({
      req,
      res,
      workflow,
      userId,
      chatId,
      decryptedApiKey,
      userContent: userMultimodalContent,
      userTextContent: parsedContent.textContent,
      userMessageId,
      assistantMessageId,
      preVerifiedDeps,
      isFollowUp,
      intent,
      historyMessages,
      projectContext,
      model: selectedModel,
    });
  } catch (error) {
    logger.error(ensureError(error), "unifiedSendMessage error");
    sendStreamError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  } finally {
    if (slotAcquired && userId) {
      await releaseUserSlot(userId).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Failed to release user slot for ${userId}`,
        ),
      );
    }
  }
}
