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
  const attemptedResumeForChatRef = useRef<string | null>(null);
  const MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS = 3;
  const ACTIVE_RUN_LOOKUP_RETRY_MS = 800;

  useEffect(() => {
    if (isSandboxing && !sandboxOpen) {
      openSandbox();
    }
  }, [isSandboxing, sandboxOpen, openSandbox]);

  useSandboxSync(chatId);

  useEffect(() => {
    setActiveChatId(chatId);
    attemptedResumeForChatRef.current = null;
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    if (!chatId || hasActiveStreamState) {
      return;
    }

    if (attemptedResumeForChatRef.current === chatId) {
      return;
    }

    attemptedResumeForChatRef.current = chatId;
    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const response = await getActiveRun(chatId);
          const activeRun = response.data.run;

          if (!cancelled && activeRun) {
            resumeRunStream(chatId, activeRun.id);
          }
          return;
        } catch {
          if (attempt === MAX_ACTIVE_RUN_LOOKUP_ATTEMPTS - 1 || cancelled) {
            return;
          }
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              ACTIVE_RUN_LOOKUP_RETRY_MS * (attempt + 1),
            ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, hasActiveStreamState, resumeRunStream]);
}
