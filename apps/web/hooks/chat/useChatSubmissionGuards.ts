import { useMemo } from "react";
import { useChatSubmissionLock } from "@/hooks/chat/useChatSubmissionLock";
import { useRateLimitScope } from "@/hooks/rateLimit/useRateLimitScope";
import {
  formatRateLimitResetTime,
  RATE_LIMIT_SCOPE,
} from "@/lib/rateLimit/scopes";

export interface ChatSubmissionGuards {
  isChatRateLimited: boolean;
  chatRateLimitMessage: string | null;
  isSubmissionLocked: boolean;
  submissionLockMessage: string | null;
}

export function useChatSubmissionGuards(): ChatSubmissionGuards {
  const burstRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.CHAT_BURST);
  const dailyRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.CHAT_DAILY);
  const submissionLock = useChatSubmissionLock();

  const activeChatRateLimit = useMemo(() => {
    if (dailyRateLimit.isActive) {
      return dailyRateLimit;
    }
    if (burstRateLimit.isActive) {
      return burstRateLimit;
    }
    return null;
  }, [burstRateLimit, dailyRateLimit]);

  const chatRateLimitMessage = useMemo(() => {
    if (!activeChatRateLimit) {
      return null;
    }

    if (activeChatRateLimit.scope === RATE_LIMIT_SCOPE.CHAT_DAILY) {
      if (!activeChatRateLimit.resetAt) {
        return "Daily message quota exhausted.";
      }
      return `Daily message quota exhausted. You can send again at ${formatRateLimitResetTime(activeChatRateLimit.resetAt)}.`;
    }

    return `Message limit reached. Try again in ${activeChatRateLimit.remainingSeconds}s.`;
  }, [activeChatRateLimit]);

  const submissionLockMessage = useMemo(() => {
    if (!submissionLock.isLocked) {
      return null;
    }

    if (submissionLock.isOwnedByCurrentTab) {
      return "Two message sends are already in progress.";
    }

    return "Maximum concurrent chats reached (2). Please wait.";
  }, [submissionLock.isLocked, submissionLock.isOwnedByCurrentTab]);

  return {
    isChatRateLimited: activeChatRateLimit !== null,
    chatRateLimitMessage,
    isSubmissionLocked: submissionLock.isLocked,
    submissionLockMessage,
  };
}
