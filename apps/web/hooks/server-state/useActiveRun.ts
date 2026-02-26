"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActiveRunResponse } from "@edward/shared/api/contracts";
import { getActiveRun } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";

interface FetchActiveRunOptions {
  signal?: AbortSignal;
  staleTimeMs?: number;
}

const DEFAULT_ACTIVE_RUN_STALE_TIME_MS = 5_000;

export function useActiveRunLookup(chatId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.activeRun.byChatId(chatId);

  const fetchActiveRun = useCallback(
    async (options?: FetchActiveRunOptions): Promise<ActiveRunResponse | null> => {
      if (!chatId) {
        return null;
      }

      return queryClient.fetchQuery({
        queryKey,
        queryFn: () => getActiveRun(chatId, { signal: options?.signal }),
        staleTime: options?.staleTimeMs ?? DEFAULT_ACTIVE_RUN_STALE_TIME_MS,
      });
    },
    [chatId, queryClient, queryKey],
  );

  const clearCachedActiveRun = useCallback(() => {
    queryClient.removeQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);

  return {
    queryKey,
    fetchActiveRun,
    clearCachedActiveRun,
  };
}
