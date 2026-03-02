"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cancelRun } from "@/lib/api/chat";
import { useSandboxSync } from "@/hooks/chat/useSandboxSync";
import { useActiveRunLookup } from "@/hooks/server-state/useActiveRun";
import {
  buildNoRunLookupCooldownKey,
  clearNoRunLookupCooldown,
  isNoRunLookupOnCooldown,
  markNoRunLookupCooldown,
} from "@/hooks/chat/activeRunCooldown";
import {
  clearRunStopIntent,
  hasRunStopIntent,
  markRunStopIntentAttempt,
  shouldAttemptRunStopIntent,
} from "@/lib/chat/runStopIntent";

interface UseChatPageOrchestrationParams {
  chatId: string;
  latestUserMessageId: string | null;
  hasResumeAttachError: boolean;
  isSandboxing: boolean;
  hasActiveStreamState: boolean;
  activeRunLookupMode: "aggressive" | "single" | "defer";
  sandboxOpen: boolean;
  openSandbox: (chatId?: string) => void;
  setRouteChatId: (chatId: string | null) => void;
  setActiveChatId: (id: string | null) => void;
  resumeRunStream: (chatId: string, runId: string) => void;
}

const AGGRESSIVE_ACTIVE_RUN_NOT_FOUND_ATTEMPTS = 6;
const AGGRESSIVE_ACTIVE_RUN_ERROR_ATTEMPTS = 4;
const SINGLE_ACTIVE_RUN_LOOKUP_ATTEMPTS = 1;
const ACTIVE_RUN_LOOKUP_BASE_RETRY_MS = 350;
const ACTIVE_RUN_LOOKUP_MAX_RETRY_MS = 2000;

function reportActiveRunOrchestrationError(
  context: string,
  chatId: string,
  error: unknown,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.error(`[chatOrchestration:${chatId}] ${context}`, error);
}

function getRetryDelayMs(attempt: number): number {
  return Math.min(
    ACTIVE_RUN_LOOKUP_MAX_RETRY_MS,
    ACTIVE_RUN_LOOKUP_BASE_RETRY_MS * 2 ** attempt,
  );
}

function waitForRetry(attempt: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const onAbort = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, getRetryDelayMs(attempt));

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRetryableActiveRunError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return true;
  }

  const maybeStatus = (error as { status?: unknown }).status;
  if (typeof maybeStatus !== "number") {
    return true;
  }

  return maybeStatus === 429 || maybeStatus >= 500;
}

export function useChatPageOrchestration({
  chatId,
  latestUserMessageId,
  hasResumeAttachError,
  isSandboxing,
  hasActiveStreamState,
  activeRunLookupMode,
  sandboxOpen,
  openSandbox,
  setRouteChatId,
  setActiveChatId,
  resumeRunStream,
}: UseChatPageOrchestrationParams) {
  const resumeLookupInFlightRef = useRef<string | null>(null);
  const runResumedForLookupKeyRef = useRef<string | null>(null);
  const { fetchActiveRun, clearCachedActiveRun } = useActiveRunLookup(chatId);

  useLayoutEffect(() => {
    setRouteChatId(chatId);
    return () => setRouteChatId(null);
  }, [chatId, setRouteChatId]);

  useEffect(() => {
    if (isSandboxing && !sandboxOpen) {
      openSandbox(chatId);
    }
  }, [chatId, isSandboxing, sandboxOpen, openSandbox]);

  useSandboxSync(chatId);

  useEffect(() => {
    setActiveChatId(chatId);
    resumeLookupInFlightRef.current = null;
    runResumedForLookupKeyRef.current = null;
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    if (!chatId || hasActiveStreamState || activeRunLookupMode === "defer") {
      return;
    }

    const stopIntentLookupKey = `stop:${chatId}`;
    if (hasRunStopIntent(chatId)) {
      if (!shouldAttemptRunStopIntent(chatId)) {
        return;
      }

      if (resumeLookupInFlightRef.current === stopIntentLookupKey) {
        return;
      }

      resumeLookupInFlightRef.current = stopIntentLookupKey;
      markRunStopIntentAttempt(chatId);
      const abortController = new AbortController();

      void (async () => {
        if (abortController.signal.aborted) {
          return;
        }

        try {
          const response = await fetchActiveRun({
            signal: abortController.signal,
            staleTimeMs: 0,
          });
          const activeRun = response?.data.run;
          if (!activeRun) {
            clearRunStopIntent(chatId);
            clearCachedActiveRun();
            return;
          }

          await cancelRun(chatId, activeRun.id);
          await waitForRetry(0, abortController.signal);

          const finalStatus = await fetchActiveRun({
            signal: abortController.signal,
            staleTimeMs: 0,
          });
          if (!finalStatus?.data.run) {
            clearRunStopIntent(chatId);
            clearCachedActiveRun();
          }
        } catch (error) {
          if (isAbortError(error) || abortController.signal.aborted) {
            return;
          }
          reportActiveRunOrchestrationError(
            "stop-intent cancel verification failed",
            chatId,
            error,
          );
        }
      })().finally(() => {
        if (resumeLookupInFlightRef.current === stopIntentLookupKey) {
          resumeLookupInFlightRef.current = null;
        }
      });

      return () => {
        abortController.abort();
      };
    }

    const noRunLookupKey = buildNoRunLookupCooldownKey(
      chatId,
      latestUserMessageId,
    );

    if (hasResumeAttachError) {
      runResumedForLookupKeyRef.current = null;
    }

    if (resumeLookupInFlightRef.current === chatId) {
      return;
    }

    if (runResumedForLookupKeyRef.current === noRunLookupKey) {
      return;
    }

    if (isNoRunLookupOnCooldown(noRunLookupKey)) {
      return;
    }

    const maxNotFoundAttempts =
      activeRunLookupMode === "aggressive"
        ? AGGRESSIVE_ACTIVE_RUN_NOT_FOUND_ATTEMPTS
        : SINGLE_ACTIVE_RUN_LOOKUP_ATTEMPTS;
    const maxErrorAttempts =
      activeRunLookupMode === "aggressive"
        ? AGGRESSIVE_ACTIVE_RUN_ERROR_ATTEMPTS
        : SINGLE_ACTIVE_RUN_LOOKUP_ATTEMPTS;

    resumeLookupInFlightRef.current = chatId;
    const abortController = new AbortController();

    void (async () => {
      let notFoundAttempts = 0;
      let errorAttempts = 0;

      while (
        notFoundAttempts < maxNotFoundAttempts &&
        errorAttempts < maxErrorAttempts
      ) {
        if (abortController.signal.aborted) {
          return;
        }

        try {
          const response = await fetchActiveRun({
            signal: abortController.signal,
            staleTimeMs: 0,
          });
          if (!response) {
            return;
          }
          const activeRun = response.data.run;

          if (activeRun) {
            clearNoRunLookupCooldown(noRunLookupKey);
            clearCachedActiveRun();
            runResumedForLookupKeyRef.current = noRunLookupKey;
            resumeRunStream(chatId, activeRun.id);
            return;
          }

          notFoundAttempts += 1;

          if (notFoundAttempts >= maxNotFoundAttempts) {
            markNoRunLookupCooldown(noRunLookupKey);
            return;
          }

          await waitForRetry(notFoundAttempts - 1, abortController.signal);
        } catch (error) {
          if (isAbortError(error) || abortController.signal.aborted) {
            return;
          }

          if (!isRetryableActiveRunError(error)) {
            markNoRunLookupCooldown(noRunLookupKey);
            return;
          }

          errorAttempts += 1;
          if (errorAttempts >= maxErrorAttempts) {
            markNoRunLookupCooldown(noRunLookupKey);
            return;
          }

          await waitForRetry(errorAttempts - 1, abortController.signal);
        }
      }
    })().finally(() => {
      if (resumeLookupInFlightRef.current === chatId) {
        resumeLookupInFlightRef.current = null;
      }
    });

    return () => {
      abortController.abort();
    };
  }, [
    chatId,
    latestUserMessageId,
    hasResumeAttachError,
    hasActiveStreamState,
    activeRunLookupMode,
    clearCachedActiveRun,
    fetchActiveRun,
    resumeRunStream,
  ]);
}
