"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import type { ChatHistoryResponse, ChatMessage } from "@/lib/chatTypes";

export function useChatHistory(chatId: string | undefined) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["chatHistory", chatId],
        queryFn: async (): Promise<ChatMessage[]> => {
            if (!chatId) return [];

            const response = await fetchApi<ChatHistoryResponse>(
                `/chat/${chatId}/history`,
            );

            return response.data.messages;
        },
        enabled: !!chatId,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    return {
        messages: data ?? [],
        isLoading,
        error: error as Error | null,
        refetch,
    };
}
