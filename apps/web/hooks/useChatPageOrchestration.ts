"use client";

import { useEffect, useRef } from "react";
import { useSandboxSync } from "@/hooks/useSandboxSync";
import { getActiveRun } from "@/lib/api";

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
  const MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS = 6;
  const ACTIVE_RUN_LOOKUP_BASE_RETRY_MS = 350;
  const ACTIVE_RUN_LOOKUP_MAX_RETRY_MS = 2000;

  const getRetryDelayMs = (attempt: number): number =>
    Math.min(
      ACTIVE_RUN_LOOKUP_MAX_RETRY_MS,
      ACTIVE_RUN_LOOKUP_BASE_RETRY_MS * 2 ** attempt,
    );

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
    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const response = await getActiveRun(chatId);
          const activeRun = response.data.run;

          if (!cancelled && activeRun) {
            resumeRunStream(chatId, activeRun.id);
            return;
          }

          if (attempt === MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS - 1 || cancelled) {
            return;
          }

          await new Promise((resolve) =>
            setTimeout(
              resolve,
              getRetryDelayMs(attempt),
            ),
          );
        } catch {
          if (attempt === MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS - 1 || cancelled) {
            return;
          }
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              getRetryDelayMs(attempt),
            ),
          );
        }
      }
    })().finally(() => {
      if (resumeLookupInFlightRef.current === chatId) {
        resumeLookupInFlightRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chatId, hasActiveStreamState, resumeRunStream]);
}
