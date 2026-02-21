"use client";

import { m } from "motion/react";
import { RefreshCw, X, Code2, AlertCircle, Monitor } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus, SandboxMode, useSandbox } from "@/contexts/sandboxContext";
import { GithubIntegrationBar } from "@/components/chat/githubIntegrationBar";

interface SandboxHeaderProps {
  chatId: string;
  projectName: string | null;
}

export function SandboxHeader({ chatId, projectName }: SandboxHeaderProps) {
  const { mode, files, buildStatus, isStreaming, setMode, closeSandbox } =
    useSandbox();

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
          <div className="flex items-center gap-1.5 leading-none">
            {isStreaming ||
              buildStatus === BuildStatus.QUEUED ||
              buildStatus === BuildStatus.BUILDING ||
              (files.length === 0 && buildStatus === BuildStatus.IDLE) ||
              buildStatus === BuildStatus.FAILED ? (
              <m.div
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-4 px-1.5 gap-1 rounded-sm border border-workspace-border bg-workspace-sidebar text-workspace-foreground text-[8px] font-bold uppercase tracking-tighter flex items-center"
              >
                {buildStatus === BuildStatus.FAILED ? (
                  <AlertCircle className="h-2.5 w-2.5 text-destructive" />
                ) : (
                  <m.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <RefreshCw className="h-2.5 w-2.5 text-workspace-accent animate-spin-slow" />
                  </m.div>
                )}
                <span
                  className={cn(
                    "text-[8px] font-bold uppercase tracking-tighter",
                    buildStatus === BuildStatus.FAILED
                      ? "text-destructive"
                      : "text-workspace-accent",
                  )}
                >
                  {buildStatus === BuildStatus.FAILED
                    ? "Error"
                    : isStreaming
                      ? "Coding"
                      : buildStatus === BuildStatus.QUEUED
                        ? "Queued"
                        : buildStatus === BuildStatus.BUILDING
                          ? "Deploying"
                      : "Initializing"}
                </span>
              </m.div>
            ) : (
              <m.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[8px] text-workspace-header-fg/60 font-medium uppercase tracking-tighter"
              >
                {files.length} Files
              </m.span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <GithubIntegrationBar chatId={chatId} projectName={projectName} />

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
