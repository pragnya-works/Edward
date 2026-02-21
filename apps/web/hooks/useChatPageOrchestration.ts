"use client";

import { useEffect, useRef } from "react";
import { useSandboxSync } from "@/hooks/useSandboxSync";
import { getActiveRun } from "@/lib/api";

const MAX_ACTIVE_RUN_NOT_FOUND_ATTEMPTS = 3;
const MAX_ACTIVE_RUN_ERROR_ATTEMPTS = 4;
const ACTIVE_RUN_LOOKUP_BASE_RETRY_MS = 350;
const ACTIVE_RUN_LOOKUP_MAX_RETRY_MS = 2000;

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

interface UseChatPageOrchestrationParams {
  chatId: string;
  isSandboxing: boolean;
  hasActiveStreamState: boolean;
  sandboxOpen: boolean;
  openSandbox: () => void;
  setActiveChatId: (id: string | null) => void;
  resumeRunStream: (chatId: string, runId: string) => void;
}

export function useChatPageOrchestration({
  chatId,
  isSandboxing,
  hasActiveStreamState,
  sandboxOpen,
  openSandbox,
  setActiveChatId,
  resumeRunStream,
}: UseChatPageOrchestrationParams) {
  const resumeLookupInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSandboxing && !sandboxOpen) {
      openSandbox();
    }
  }, [isSandboxing, sandboxOpen, openSandbox]);

  useSandboxSync(chatId);

  useEffect(() => {
    setActiveChatId(chatId);
    resumeLookupInFlightRef.current = null;
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    if (!chatId || hasActiveStreamState) {
      return;
    }

    if (resumeLookupInFlightRef.current === chatId) {
      return;
    }

    resumeLookupInFlightRef.current = chatId;
    const abortController = new AbortController();

    void (async () => {
      let notFoundAttempts = 0;
      let errorAttempts = 0;

      while (
        notFoundAttempts < MAX_ACTIVE_RUN_NOT_FOUND_ATTEMPTS &&
        errorAttempts < MAX_ACTIVE_RUN_ERROR_ATTEMPTS
      ) {
        if (abortController.signal.aborted) {
          return;
        }

        try {
          const response = await getActiveRun(chatId, {
            signal: abortController.signal,
          });
          const activeRun = response.data.run;

          if (activeRun) {
            resumeRunStream(chatId, activeRun.id);
            return;
          }

          notFoundAttempts += 1;

          if (notFoundAttempts >= MAX_ACTIVE_RUN_NOT_FOUND_ATTEMPTS) {
            return;
          }

          await waitForRetry(notFoundAttempts - 1, abortController.signal);
        } catch (error) {
          if (isAbortError(error) || abortController.signal.aborted) {
            return;
          }

          if (!isRetryableActiveRunError(error)) {
            return;
          }

          errorAttempts += 1;
          if (errorAttempts >= MAX_ACTIVE_RUN_ERROR_ATTEMPTS) {
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
  }, [chatId, hasActiveStreamState, resumeRunStream]);
}
