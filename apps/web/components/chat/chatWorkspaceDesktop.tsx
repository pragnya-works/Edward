import type { RefObject } from "react";
import { m } from "motion/react";
import {
  Group as PanelGroup,
  Panel,
  type PanelImperativeHandle,
  type PanelSize,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";
import { ChatMessageList } from "@/components/chat/messages/chatMessageList";
import { SandboxPanel } from "@/components/chat/sandbox/sandboxPanel";

interface ChatWorkspaceDesktopProps {
  prefersReducedMotion: boolean;
  isDesktopSandboxVisible: boolean;
  desktopKeepMounted: boolean;
  sandboxPanelRef: RefObject<PanelImperativeHandle | null>;
  sandboxMinSize: string;
  onSandboxResize: (panelSize: PanelSize) => void;
}

const DEFAULT_SANDBOX_SIZE = 45;
const MAX_SANDBOX_SIZE = 75;
const MIN_CHAT_SIZE = 100 - MAX_SANDBOX_SIZE;

export function ChatWorkspaceDesktop({
  prefersReducedMotion,
  isDesktopSandboxVisible,
  desktopKeepMounted,
  sandboxPanelRef,
  sandboxMinSize,
  onSandboxResize,
}: ChatWorkspaceDesktopProps) {
  const { isOpen: sandboxOpen } = useSandbox();

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
            <ChatMessageList />
          </div>
          <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
            <AuthenticatedPromptbar />
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
          onResize={onSandboxResize}
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
            {sandboxOpen || desktopKeepMounted ? (
              <SandboxPanel />
            ) : null}
          </m.div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
