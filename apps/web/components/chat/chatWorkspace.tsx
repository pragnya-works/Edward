"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { ChatMessageList } from "@/components/chat/chatMessageList";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";
import type { ChatMessage as ChatMessageType, StreamState } from "@/lib/chatTypes";
import { SandboxPanel } from "@/components/chat/sandboxPanel";
import { m, useReducedMotion } from "motion/react";
import {
  Group as PanelGroup,
  Panel,
  type PanelImperativeHandle,
  type PanelSize,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Sheet, SheetContent } from "@edward/ui/components/sheet";
import { useSandbox } from "@/contexts/sandboxContext";
import { cn } from "@edward/ui/lib/utils";
import { parseMessageContent, MessageBlockType } from "@/lib/messageParser";
import { ChatRole } from "@/lib/chatTypes";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

const DEFAULT_SANDBOX_SIZE = 45;
const MIN_SANDBOX_SIZE = 24;
const MAX_SANDBOX_SIZE = 75;
const MIN_CHAT_SIZE = 100 - MAX_SANDBOX_SIZE;
const SANDBOX_TOGGLE_DURATION_MS = 280;

function clampSandboxSize(size: number) {
  return Math.min(MAX_SANDBOX_SIZE, Math.max(MIN_SANDBOX_SIZE, size));
}

function easeSandboxToggle(t: number) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function extractLatestSandboxProjectName(content: string): string | null {
  const blocks = parseMessageContent(content);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.type === MessageBlockType.SANDBOX && block.project) {
      return block.project;
    }
  }
  return null;
}

interface ChatWorkspaceProps {
  chatId: string;
  messages: ChatMessageType[];
  stream: StreamState;
  sandboxOpen: boolean;
}

interface DesktopSandboxUiState {
  isTransitioning: boolean;
  keepMounted: boolean;
}

type DesktopSandboxUiAction =
  | { type: "SYNC_FOR_MOBILE"; sandboxOpen: boolean }
  | { type: "START_OPEN_TRANSITION" }
  | { type: "FINISH_OPEN_TRANSITION" }
  | { type: "START_CLOSE_TRANSITION" }
  | { type: "FINISH_CLOSE_TRANSITION" };

const INITIAL_DESKTOP_SANDBOX_UI_STATE: DesktopSandboxUiState = {
  isTransitioning: false,
  keepMounted: false,
};

function desktopSandboxUiReducer(
  _state: DesktopSandboxUiState,
  action: DesktopSandboxUiAction,
): DesktopSandboxUiState {
  switch (action.type) {
    case "SYNC_FOR_MOBILE":
      return {
        isTransitioning: false,
        keepMounted: action.sandboxOpen,
      };
    case "START_OPEN_TRANSITION":
      return {
        isTransitioning: true,
        keepMounted: true,
      };
    case "FINISH_OPEN_TRANSITION":
      return {
        isTransitioning: false,
        keepMounted: true,
      };
    case "START_CLOSE_TRANSITION":
      return {
        isTransitioning: true,
        keepMounted: true,
      };
    case "FINISH_CLOSE_TRANSITION":
      return {
        isTransitioning: false,
        keepMounted: false,
      };
    default:
      return _state;
  }
}

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
  const isMobile = useIsMobileViewport();

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

  const isDesktopSandboxVisible =
    desktopSandboxUi.keepMounted || desktopSandboxUi.isTransitioning;
  const sandboxMinSize =
    sandboxOpen && desktopSandboxUi.keepMounted && !desktopSandboxUi.isTransitioning
      ? `${MIN_SANDBOX_SIZE}%`
      : "0%";

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] w-full overflow-hidden">
        <div className="relative flex flex-col h-full w-full min-w-0">
          <div className="flex-1 min-h-0">
            <ChatMessageList messages={messages} stream={stream} />
          </div>
          <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
            <AuthenticatedPromptbar chatId={chatId} />
          </div>
        </div>

        <Sheet
          open={sandboxOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeSandbox();
            }
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-full max-w-none p-0 gap-0 border-l border-workspace-border bg-workspace-bg"
          >
            <SandboxPanel projectName={projectName} />
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <PanelGroup
        orientation="horizontal"
        className="flex-1 w-full h-full"
        defaultLayout={{
          chat: sandboxOpen ? 100 - DEFAULT_SANDBOX_SIZE : 100,
          sandbox: sandboxOpen ? DEFAULT_SANDBOX_SIZE : 0,
        }}
      >
        <Panel
          id="chat"
          minSize={`${MIN_CHAT_SIZE}%`}
          className="relative flex flex-col h-full min-w-[350px]"
        >
          <div className="flex-1 min-h-0">
            <ChatMessageList messages={messages} stream={stream} />
          </div>
          <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
            <AuthenticatedPromptbar chatId={chatId} />
          </div>
        </Panel>
        <PanelResizeHandle
          disabled={!isDesktopSandboxVisible}
          className={cn(
            "w-[2px] transition-[opacity,background-color] duration-200 bg-border hover:bg-primary/50 cursor-col-resize z-10 mx-[1px]",
            !isDesktopSandboxVisible && "opacity-0 pointer-events-none",
          )}
        />
        <Panel
          id="sandbox"
          panelRef={sandboxPanelRef}
          defaultSize={sandboxOpen ? `${DEFAULT_SANDBOX_SIZE}%` : "0%"}
          minSize={sandboxMinSize}
          maxSize={`${MAX_SANDBOX_SIZE}%`}
          collapsible
          collapsedSize="0%"
          onResize={handleSandboxResize}
          className={cn(
            "flex-1 min-h-[100dvh] bg-workspace-bg overflow-hidden flex flex-col relative transition-[border-color] duration-200",
            isDesktopSandboxVisible
              ? "border-l border-workspace-border"
              : "border-l border-transparent",
          )}
        >
          <m.div
            initial={false}
            animate={sandboxOpen
              ? { opacity: 1, x: 0, scale: 1 }
              : { opacity: 0.6, x: 16, scale: 0.99 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex-1 min-h-[0] h-full"
          >
            {sandboxOpen || desktopSandboxUi.keepMounted ? (
              <SandboxPanel projectName={projectName} />
            ) : null}
          </m.div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
