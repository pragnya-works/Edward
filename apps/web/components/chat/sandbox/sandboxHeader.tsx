"use client";

import { X, Code2, Monitor } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { KeyboardShortcut } from "@edward/ui/components/ui/keyboardShortcut";
import { useIsMac } from "@edward/ui/hooks/useIsMac";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/stores/sandbox/hooks";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { SandboxMode } from "@/stores/sandbox/types";
import { GithubIntegrationBar } from "@/components/chat/sandbox/githubIntegrationBar";

export function SandboxHeader() {
  const { projectName } = useChatWorkspaceContext();
  const { mode, files, setMode, closeSandbox } = useSandbox();
  const isMac = useIsMac();

  return (
    <div className="flex items-center justify-between gap-2.5 px-3 md:px-4 py-2.5 border-b border-workspace-border bg-workspace-sidebar text-workspace-header-fg shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-[38px] md:h-10 shrink-0 rounded-[999px] border border-workspace-border bg-workspace-bg px-[3px] py-[3px] flex items-center gap-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setMode(SandboxMode.CODE)}
            aria-label="Switch to code view"
            className={cn(
              "h-[30px] w-[30px] md:h-[32px] md:w-[32px] rounded-[999px] text-workspace-foreground/85 transition-all",
              mode === SandboxMode.CODE
                ? "bg-workspace-active text-workspace-accent shadow-[0_0_0_1.5px_rgba(56,189,248,0.5)]"
                : "hover:bg-workspace-hover text-workspace-foreground/75",
            )}
          >
            <Code2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setMode(SandboxMode.PREVIEW)}
            aria-label="Switch to preview view"
            className={cn(
              "h-[30px] w-[30px] md:h-[32px] md:w-[32px] rounded-[999px] text-workspace-foreground/85 transition-all",
              mode === SandboxMode.PREVIEW
                ? "bg-workspace-active text-workspace-accent shadow-[0_0_0_1.5px_rgba(56,189,248,0.5)]"
                : "hover:bg-workspace-hover text-workspace-foreground/75",
            )}
          >
            <Monitor className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] md:text-[13px] font-bold tracking-tight text-workspace-header-fg/90 truncate">
            {projectName ?? "Workspace"}
          </span>
          <div className="flex items-center gap-2 leading-none">
            <span className="text-[8px] text-workspace-header-fg/60 font-medium uppercase tracking-tighter">
              {files.length} {files.length === 1 ? "File" : "Files"}
            </span>
            <div
              className="flex items-center gap-1.5"
              aria-label="Keyboard shortcut: press Control or Command and K to open file search"
            >
              <span className="text-[8px] text-workspace-header-fg/55 font-medium tracking-tight">
                Search
              </span>
              <KeyboardShortcut className="h-4 gap-1 px-1.5 border-workspace-border bg-workspace-bg text-workspace-header-fg/85 text-[9px]">
                <span className="text-[8px]">{isMac ? "⌘" : "Ctrl"}</span>K
              </KeyboardShortcut>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <GithubIntegrationBar />

        <Button
          variant="ghost"
          size="icon"
          onClick={closeSandbox}
          aria-label="Close workspace"
          className="h-8 w-8 rounded-lg hover:bg-workspace-hover text-workspace-header-fg"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
