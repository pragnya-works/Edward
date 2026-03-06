"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/httpClient";
import type { ChatHistoryResponse, ChatMessage } from "@edward/shared/chat/types";
import { dedupeMessagesById } from "@/lib/chatHistory/dedupeMessages";
import { queryKeys } from "@/lib/queryKeys";

export function useChatHistory(chatId: string | undefined) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: queryKeys.chatHistory.byChatId(chatId),
        queryFn: async (): Promise<ChatMessage[]> => {
            if (!chatId) return [];

            const response = await fetchApi<ChatHistoryResponse>(
                `/chat/${chatId}/history`,
            );

            return dedupeMessagesById(response.data.messages);
        },
        enabled: !!chatId,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    return {
        messages: dedupeMessagesById(data ?? []),
        isLoading,
        error: error as Error | null,
        refetch,
    };
}
