import {
  type ActiveRunResponse,
  type DailyChatQuotaResponse,
  type PromptEnhanceResponse,
} from "@edward/shared/api/contracts";
import { type Provider } from "@edward/shared/constants";
import { fetchApi, fetchApiResponse } from "@/lib/api/httpClient";
import type { MessageContent } from "@/lib/api/messageContent";

export interface SendMessageRequest {
  content: MessageContent;
  chatId?: string;
  title?: string;
  model?: string;
  retryTargetUserMessageId?: string;
  retryTargetAssistantMessageId?: string;
}

export interface ChatMetaResponse {
  message: string;
  data: {
    chatId: string;
    title: string | null;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: string;
  };
  timestamp: string;
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
  await fetchApi<{ cancelled: boolean }>(
    `/chat/${chatId}/runs/${runId}/cancel`,
    { method: "POST" },
  );
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

export async function getDailyChatQuota(
  options?: { signal?: AbortSignal },
): Promise<DailyChatQuotaResponse> {
  return fetchApi<DailyChatQuotaResponse>("/chat/quota/daily", {
    method: "GET",
    signal: options?.signal,
  });
}

export async function getChatMeta(
  chatId: string,
  options?: { signal?: AbortSignal },
): Promise<ChatMetaResponse> {
  return fetchApi<ChatMetaResponse>(`/chat/${chatId}/meta`, {
    method: "GET",
    signal: options?.signal,
  });
}

export async function deleteChat(chatId: string): Promise<void> {
  await fetchApi(`/chat/${chatId}`, { method: "DELETE" });
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
