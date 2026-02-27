import {
  type ActiveRunResponse,
  type ChatShareStatusResponse,
  type PromptEnhanceResponse,
  type SharedChatHistoryResponse,
} from "@edward/shared/api/contracts";
import { type Provider } from "@edward/shared/constants";
import { fetchApi, fetchApiResponse } from "@/lib/api/httpClient";
import type { MessageContent } from "@/lib/api/messageContent";

export interface SendMessageRequest {
  content: MessageContent;
  chatId?: string;
  title?: string;
  visibility?: boolean;
  model?: string;
  retryTargetUserMessageId?: string;
  retryTargetAssistantMessageId?: string;
}

export async function postChatMessageStream(
  body: SendMessageRequest,
  signal?: AbortSignal,
): Promise<Response> {
  return fetchApiResponse("/chat/message", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function openRunEventsStream(
  chatId: string,
  runId: string,
  options?: { lastEventId?: string; signal?: AbortSignal },
): Promise<Response> {
  const params = new URLSearchParams();
  if (options?.lastEventId) {
    params.set("lastEventId", options.lastEventId);
  }

  const queryString = params.toString();
  return fetchApiResponse(
    `/chat/${chatId}/runs/${runId}/stream${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      signal: options?.signal,
    },
  );
}

export async function cancelRun(
  chatId: string,
  runId: string,
): Promise<void> {
  try {
    await fetchApi<{ cancelled: boolean }>(
      `/chat/${chatId}/runs/${runId}/cancel`,
      { method: "POST" },
    );
  } catch {
    // Non-critical — the client-side abort already stops the SSE connection.
    // The backend will eventually mark the run terminal on its own.
  }
}

export async function getActiveRun(
  chatId: string,
  options?: { signal?: AbortSignal },
): Promise<ActiveRunResponse> {
  return fetchApi<ActiveRunResponse>(`/chat/${chatId}/active-run`, {
    method: "GET",
    signal: options?.signal,
  });
}

export async function deleteChat(chatId: string): Promise<void> {
  await fetchApi(`/chat/${chatId}`, { method: "DELETE" });
}

export async function getChatShareStatus(
  chatId: string,
): Promise<ChatShareStatusResponse> {
  return fetchApi<ChatShareStatusResponse>(`/chat/${chatId}/share`, {
    method: "GET",
  });
}

export async function updateChatShareSettings(
  chatId: string,
  enabled: boolean,
): Promise<ChatShareStatusResponse> {
  return fetchApi<ChatShareStatusResponse>(`/chat/${chatId}/share`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function getSharedChatHistory(
  chatId: string,
): Promise<SharedChatHistoryResponse> {
  return fetchApi<SharedChatHistoryResponse>(`/share/chats/${chatId}/history`, {
    method: "GET",
  });
}

export async function enhancePrompt(
  text: string,
  provider?: Provider,
): Promise<PromptEnhanceResponse> {
  return fetchApi<PromptEnhanceResponse>("/chat/prompt-enhance", {
    method: "POST",
    body: JSON.stringify({ text, provider }),
  });
}
