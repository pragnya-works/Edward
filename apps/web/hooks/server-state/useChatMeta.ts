"use client";

import { useQuery } from "@tanstack/react-query";
import { getChatMeta, type ChatMetaResponse } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";

const CHAT_META_STALE_TIME_MS = 30_000;

interface UseChatMetaOptions {
  enabled?: boolean;
  staleTimeMs?: number;
}

export function useChatMeta(
  chatId: string | undefined,
  options?: UseChatMetaOptions,
) {
  return useQuery<ChatMetaResponse>({
    queryKey: queryKeys.chatMeta.byChatId(chatId),
    queryFn: () => getChatMeta(chatId!),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    staleTime: options?.staleTimeMs ?? CHAT_META_STALE_TIME_MS,
  });
}
