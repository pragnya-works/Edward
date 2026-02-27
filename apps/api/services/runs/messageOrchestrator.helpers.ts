import {
  and,
  db,
  eq,
  inArray,
  message as messageTable,
} from "@edward/auth";
import { logger } from "../../utils/logger.js";
import {
  resolveRetryTargetsFromMessages,
  type ResolvedRetryTargets,
} from "./retryMessageTargets.service.js";

export async function cleanupUnqueuedUserMessage(messageId: string): Promise<void> {
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

export async function resolveRetryTargets(
  userId: string,
  chatId: string,
  requestBody: {
    retryTargetUserMessageId?: string;
    retryTargetAssistantMessageId?: string;
  },
): Promise<ResolvedRetryTargets> {
  const requestedIds = [
    requestBody.retryTargetUserMessageId,
    requestBody.retryTargetAssistantMessageId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);

  if (requestedIds.length === 0) {
    return {};
  }

  const matchedMessages = await db
    .select({
      id: messageTable.id,
      role: messageTable.role,
    })
    .from(messageTable)
    .where(
      and(
        eq(messageTable.chatId, chatId),
        eq(messageTable.userId, userId),
        inArray(messageTable.id, requestedIds),
      ),
    );

  const resolved = resolveRetryTargetsFromMessages(requestBody, matchedMessages);

  if (
    requestBody.retryTargetUserMessageId &&
    !resolved.userMessageId
  ) {
    logger.warn(
      {
        userId,
        chatId,
        retryTargetUserMessageId: requestBody.retryTargetUserMessageId,
      },
      "Ignoring invalid retryTargetUserMessageId",
    );
  }

  if (
    requestBody.retryTargetAssistantMessageId &&
    !resolved.assistantMessageId
  ) {
    logger.warn(
      {
        userId,
        chatId,
        retryTargetAssistantMessageId: requestBody.retryTargetAssistantMessageId,
      },
      "Ignoring invalid retryTargetAssistantMessageId",
    );
  }

  return resolved;
}
