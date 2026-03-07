"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDailyChatQuota } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";
import { syncRateLimitStateOwner } from "@/lib/rateLimit/state.lifecycle";
import {
  clearRateLimitCooldown,
  clearRateLimitQuota,
  syncRateLimitQuotaSnapshot,
} from "@/lib/rateLimit/state.operations";

const CHAT_DAILY_SYNC_STALE_MS = 15 * 1000;
const CHAT_DAILY_SYNC_INTERVAL_MS = 30 * 1000;

export function useChatDailyQuotaSync(userId: string | undefined): void {
  useEffect(() => {
    syncRateLimitStateOwner(userId ?? null);

    if (userId) {
      return;
    }

    clearRateLimitCooldown(RATE_LIMIT_SCOPE.CHAT_DAILY);
    clearRateLimitQuota(RATE_LIMIT_SCOPE.CHAT_DAILY);
  }, [userId]);

  const query = useQuery({
    queryKey: queryKeys.rateLimit.chatDailyByUserId(userId),
    queryFn: ({ signal }) => getDailyChatQuota({ signal }),
    enabled: Boolean(userId),
    staleTime: CHAT_DAILY_SYNC_STALE_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: CHAT_DAILY_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const quotaPayload = query.data?.data;
  const isFetchedAfterMount = query.isFetchedAfterMount;

  useEffect(() => {
    if (!isFetchedAfterMount) {
      return;
    }

    if (!quotaPayload) {
      return;
    }

    syncRateLimitQuotaSnapshot(RATE_LIMIT_SCOPE.CHAT_DAILY, {
      limit: quotaPayload.limit,
      remaining: quotaPayload.remaining,
      resetAt: new Date(quotaPayload.resetAtMs),
      isLimited: quotaPayload.isLimited,
    });
  }, [isFetchedAfterMount, quotaPayload]);
}
