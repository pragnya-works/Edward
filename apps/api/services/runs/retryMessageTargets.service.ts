import { MessageRole } from "@edward/auth";

export interface RetryTargetMessagesRequest {
  retryTargetUserMessageId?: string;
  retryTargetAssistantMessageId?: string;
}

export interface RetryTargetMessageRecord {
  id: string;
  role: string;
}

export interface ResolvedRetryTargets {
  userMessageId?: string;
  assistantMessageId?: string;
}

export function resolveRetryTargetsFromMessages(
  request: RetryTargetMessagesRequest,
  messages: RetryTargetMessageRecord[],
): ResolvedRetryTargets {
  const roleById = new Map(messages.map((message) => [message.id, message.role]));
  const resolved: ResolvedRetryTargets = {};

  if (
    request.retryTargetUserMessageId &&
    roleById.get(request.retryTargetUserMessageId) === MessageRole.User
  ) {
    resolved.userMessageId = request.retryTargetUserMessageId;
  }

  if (
    request.retryTargetAssistantMessageId &&
    roleById.get(request.retryTargetAssistantMessageId) === MessageRole.Assistant
  ) {
    resolved.assistantMessageId = request.retryTargetAssistantMessageId;
  }

  return resolved;
}
