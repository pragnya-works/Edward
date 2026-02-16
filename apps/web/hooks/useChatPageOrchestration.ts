"use client";

import { useEffect } from "react";
import { useSandboxSync } from "@/hooks/useSandboxSync";

interface UseChatPageOrchestrationParams {
  chatId: string;
  isSandboxing: boolean;
  sandboxOpen: boolean;
  openSandbox: () => void;
  setActiveChatId: (id: string | null) => void;
}

export function useChatPageOrchestration({
  chatId,
  isSandboxing,
  sandboxOpen,
  openSandbox,
  setActiveChatId,
}: UseChatPageOrchestrationParams) {
  useEffect(() => {
    if (isSandboxing && !sandboxOpen) {
      openSandbox();
    }
  }, [isSandboxing, sandboxOpen, openSandbox]);

  useSandboxSync(chatId);

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);
}