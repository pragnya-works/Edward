"use client";

import { m } from "motion/react";
import { RefreshCw, X, Code2, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@edward/ui/components/tabs";
import { Button } from "@edward/ui/components/button";
import { Separator } from "@edward/ui/components/separator";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus, SandboxMode, useSandbox } from "@/contexts/sandboxContext";

interface SandboxHeaderProps {
  projectName: string | null;
}

export function SandboxHeader({ projectName }: SandboxHeaderProps) {
  const { mode, files, buildStatus, isStreaming, setMode, closeSandbox } =
    useSandbox();

  return (
    <div className="flex items-center justify-between gap-2 px-2.5 md:px-3 py-2 border-b border-workspace-border bg-workspace-sidebar text-workspace-header-fg shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-7 w-7 rounded-md bg-workspace-accent/20 flex items-center justify-center shrink-0">
          <Code2 className="h-4 w-4 text-workspace-header-fg" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold tracking-tight text-workspace-header-fg/90 truncate">
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

      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <Tabs
          value={mode}
          onValueChange={(value) =>
            setMode(
              value === SandboxMode.PREVIEW
                ? SandboxMode.PREVIEW
                : SandboxMode.CODE,
            )
          }
          className="w-auto"
        >
          <TabsList className="h-7 p-0.5 bg-workspace-sidebar border border-workspace-border shrink-0">
            <TabsTrigger
              value="code"
              className="h-6 px-2.5 md:px-3 text-[10px] gap-1.5 font-semibold transition-all text-workspace-foreground data-active:bg-workspace-bg data-active:text-workspace-accent"
            >
              Code
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="h-6 px-2.5 md:px-3 text-[10px] gap-1.5 font-semibold transition-all text-workspace-foreground data-active:bg-workspace-bg data-active:text-workspace-accent"
            >
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator orientation="vertical" className="h-5 bg-workspace-border hidden md:block" />

        <Button
          variant="ghost"
          size="icon"
          onClick={closeSandbox}
          aria-label="Close workspace"
          className="h-7 w-7 rounded-md hover:bg-workspace-hover text-workspace-header-fg"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
