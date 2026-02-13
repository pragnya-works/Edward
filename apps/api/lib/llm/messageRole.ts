import { MessageRole } from "@edward/auth";

export type LlmConversationRole = MessageRole.User | MessageRole.Assistant;
export type TokenBreakdownRole = MessageRole.System | LlmConversationRole;

function normalizeMessageRole(role: unknown): MessageRole | null {
  if (typeof role !== "string") return null;

  const normalized = role.trim().toLowerCase();
  switch (normalized) {
    case MessageRole.System:
      return MessageRole.System;
    case MessageRole.User:
      return MessageRole.User;
    case MessageRole.Assistant:
      return MessageRole.Assistant;
    case MessageRole.Data:
      return MessageRole.Data;
    default:
      return null;
  }
}

export function normalizeConversationRole(role: unknown): LlmConversationRole | null {
  const normalized = normalizeMessageRole(role);
  if (normalized === MessageRole.User || normalized === MessageRole.Assistant) {
    return normalized;
  }
  return null;
}

export function isAssistantConversationRole(role: LlmConversationRole): boolean {
  return role === MessageRole.Assistant;
}

export function toGeminiRole(role: LlmConversationRole): "user" | "model" {
  return role === MessageRole.Assistant ? "model" : "user";
}
