"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ChatMessage as ChatMessageType, StreamState } from "@edward/shared/chat/types";
import { ChatRole } from "@edward/shared/chat/types";
import { ChatWorkspaceDesktop } from "@/components/chat/chatWorkspaceDesktop";
import { ChatWorkspaceMobile } from "@/components/chat/chatWorkspaceMobile";
import {
  clampSandboxSize,
  easeSandboxToggle,
  extractLatestSandboxProjectName,
} from "@/components/chat/chatWorkspaceUtils";
import {
  buildRetryContentFromUserMessage,
  findLatestUserMessage,
  findUserMessageForAssistantRetry,
} from "@/components/chat/messages/retryMessageUtils";
import {
  INITIAL_DESKTOP_SANDBOX_UI_STATE,
  desktopSandboxUiReducer,
} from "@/components/chat/sandbox/desktopSandboxUiReducer";
import { useReducedMotion } from "motion/react";
import {
  type PanelImperativeHandle,
  type PanelSize,
} from "react-resizable-panels";
import { useSandbox } from "@/contexts/sandboxContext";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";
import { useChatStreamActions } from "@/contexts/chatStreamContext";

interface ChatWorkspaceProps {
  chatId: string;
  messages: ChatMessageType[];
  stream: StreamState;
  sandboxOpen: boolean;
}

const DEFAULT_SANDBOX_SIZE = 45;
const MIN_SANDBOX_SIZE = 24;
const SANDBOX_TOGGLE_DURATION_MS = 280;

export function ChatWorkspace({
  chatId,
  messages,
  stream,
  sandboxOpen,
}: ChatWorkspaceProps) {
  const sandboxPanelRef = useRef<PanelImperativeHandle | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const animationTokenRef = useRef(0);
  const lastExpandedSizeRef = useRef(clampSandboxSize(DEFAULT_SANDBOX_SIZE));
  const currentSandboxSizeRef = useRef(sandboxOpen ? DEFAULT_SANDBOX_SIZE : 0);
  const [desktopSandboxUi, dispatchDesktopSandboxUi] = useReducer(
    desktopSandboxUiReducer,
    INITIAL_DESKTOP_SANDBOX_UI_STATE,
  );
  const prefersReducedMotion = useReducedMotion();
  const { closeSandbox } = useSandbox();
  const { startStream } = useChatStreamActions();
  const streamingProjectName = useMemo(() => {
    if (!stream.isStreaming || !stream.streamingText) {
      return null;
    }
    return extractLatestSandboxProjectName(stream.streamingText);
  }, [stream.isStreaming, stream.streamingText]);
  const historyProjectName = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || message.role !== ChatRole.ASSISTANT) {
        continue;
      }
      const project = extractLatestSandboxProjectName(message.content || "");
      if (project) {
        return project;
      }
    }
    return null;
  }, [messages]);
  const projectName = streamingProjectName ?? historyProjectName;
  const isMobile = useMobileViewport();

  const animateSandboxPanel = useCallback(
    (targetSize: number, onComplete?: () => void) => {
      animationTokenRef.current += 1;
      const animationToken = animationTokenRef.current;
      const normalizedTargetSize =
        targetSize <= 0 ? 0 : clampSandboxSize(targetSize);
      const panel = sandboxPanelRef.current;
      if (!panel) {
        onComplete?.();
        return;
      }

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const startSize = currentSandboxSizeRef.current;
      const delta = normalizedTargetSize - startSize;
      if (prefersReducedMotion || Math.abs(delta) < 0.1) {
        panel.resize(`${normalizedTargetSize}%`);
        currentSandboxSizeRef.current = normalizedTargetSize;
        onComplete?.();
        return;
      }

      const animationStart = performance.now();
      const runFrame = (timestamp: number) => {
        if (animationToken !== animationTokenRef.current) {
          return;
        }

        const elapsed = timestamp - animationStart;
        const progress = Math.min(
          elapsed / SANDBOX_TOGGLE_DURATION_MS,
          1,
        );
        const easedProgress = easeSandboxToggle(progress);
        const nextSize = startSize + delta * easedProgress;

        panel.resize(`${nextSize}%`);
        currentSandboxSizeRef.current = nextSize;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(runFrame);
          return;
        }

        animationFrameRef.current = null;
        panel.resize(`${normalizedTargetSize}%`);
        currentSandboxSizeRef.current = normalizedTargetSize;
        onComplete?.();
      };

      animationFrameRef.current = requestAnimationFrame(runFrame);
    },
    [prefersReducedMotion],
  );

  useLayoutEffect(() => {
    if (isMobile) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      animationTokenRef.current += 1;
      dispatchDesktopSandboxUi({ type: "SYNC_FOR_MOBILE", sandboxOpen });
      return;
    }

    if (sandboxOpen) {
      dispatchDesktopSandboxUi({ type: "START_OPEN_TRANSITION" });
      animateSandboxPanel(lastExpandedSizeRef.current, () => {
        dispatchDesktopSandboxUi({ type: "FINISH_OPEN_TRANSITION" });
      });
      return;
    }

    dispatchDesktopSandboxUi({ type: "START_CLOSE_TRANSITION" });
    animateSandboxPanel(0, () => {
      dispatchDesktopSandboxUi({ type: "FINISH_CLOSE_TRANSITION" });
    });
  }, [animateSandboxPanel, isMobile, sandboxOpen]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationTokenRef.current += 1;
    },
    [],
  );

  const handleSandboxResize = useCallback(
    (panelSize: PanelSize) => {
      currentSandboxSizeRef.current = panelSize.asPercentage;
      if (sandboxOpen && panelSize.asPercentage > 5) {
        lastExpandedSizeRef.current = clampSandboxSize(panelSize.asPercentage);
      }
    },
    [sandboxOpen],
  );

  const retryFromUserMessage = useCallback(
    (
      userMessage: ChatMessageType | null,
      opts?: {
        suppressOptimisticUserMessage?: boolean;
        retryTargetUserMessageId?: string;
        retryTargetAssistantMessageId?: string;
      },
    ): boolean => {
      if (!userMessage) {
        return false;
      }

      const content = buildRetryContentFromUserMessage(userMessage);
      if (!content) {
        return false;
      }

      startStream(content, {
        chatId,
        suppressOptimisticUserMessage: opts?.suppressOptimisticUserMessage,
        retryTargetUserMessageId: opts?.retryTargetUserMessageId,
        retryTargetAssistantMessageId: opts?.retryTargetAssistantMessageId,
      });
      return true;
    },
    [chatId, startStream],
  );

  const handleRetryStreamError = useCallback((): boolean => {
    const userMessageId = stream.meta?.userMessageId;
    const assistantMessageId = stream.meta?.assistantMessageId;
    const fromMeta = userMessageId
      ? messages.find(
          (message) =>
            message.id === userMessageId && message.role === ChatRole.USER,
        ) ?? null
      : null;

    return retryFromUserMessage(
      fromMeta ?? findLatestUserMessage(messages),
      {
        suppressOptimisticUserMessage: true,
        retryTargetUserMessageId: fromMeta?.id ?? userMessageId,
        retryTargetAssistantMessageId: assistantMessageId,
      },
    );
  }, [
    messages,
    retryFromUserMessage,
    stream.meta?.assistantMessageId,
    stream.meta?.userMessageId,
  ]);

  const handleRetryAssistantMessage = useCallback(
    (assistantMessageId: string): boolean => {
      const userMessage =
        findUserMessageForAssistantRetry(messages, assistantMessageId) ??
        findLatestUserMessage(messages);

      return retryFromUserMessage(userMessage, {
        suppressOptimisticUserMessage: true,
        retryTargetUserMessageId: userMessage?.id,
        retryTargetAssistantMessageId: assistantMessageId,
      });
    },
    [messages, retryFromUserMessage],
  );

  const isDesktopSandboxVisible =
    desktopSandboxUi.keepMounted || desktopSandboxUi.isTransitioning;
  const sandboxMinSize =
    sandboxOpen && desktopSandboxUi.keepMounted && !desktopSandboxUi.isTransitioning
      ? `${MIN_SANDBOX_SIZE}%`
      : "0%";

  if (isMobile) {
    return (
      <ChatWorkspaceMobile
        chatId={chatId}
        messages={messages}
        stream={stream}
        sandboxOpen={sandboxOpen}
        projectName={projectName}
        closeSandbox={closeSandbox}
        onRetryStreamError={handleRetryStreamError}
        onRetryAssistantMessage={handleRetryAssistantMessage}
      />
    );
  }

  return (
    <ChatWorkspaceDesktop
      chatId={chatId}
      messages={messages}
      stream={stream}
      sandboxOpen={sandboxOpen}
      projectName={projectName}
      prefersReducedMotion={Boolean(prefersReducedMotion)}
      isDesktopSandboxVisible={isDesktopSandboxVisible}
      desktopKeepMounted={desktopSandboxUi.keepMounted}
      sandboxPanelRef={sandboxPanelRef}
      sandboxMinSize={sandboxMinSize}
      onSandboxResize={handleSandboxResize}
      onRetryStreamError={handleRetryStreamError}
      onRetryAssistantMessage={handleRetryAssistantMessage}
    />
  );
}
