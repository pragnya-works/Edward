"use client";

import { m } from "motion/react";
import { RefreshCw, X, Code2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@edward/ui/components/tabs";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus, SandboxMode, useSandbox } from "@/contexts/sandboxContext";

export function SandboxHeader() {
  const { mode, files, buildStatus, isStreaming, setMode, closeSandbox } =
    useSandbox();

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-workspace-border bg-workspace-header text-workspace-header-fg shrink-0">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Code2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-tight text-workspace-header-fg/90">Workspace</span>
          <div className="flex items-center gap-1.5 leading-none">
            {isStreaming ||
              buildStatus === BuildStatus.QUEUED ||
              buildStatus === BuildStatus.BUILDING ||
              (files.length === 0 && buildStatus === BuildStatus.IDLE) ||
              buildStatus === BuildStatus.FAILED ? (
              <m.div
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1"
              >
                {buildStatus === BuildStatus.FAILED ? (
                  <X className="h-2 w-2 text-destructive" />
                ) : (
                  <m.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <RefreshCw className="h-2 w-2 text-amber-500 animate-spin-slow" />
                  </m.div>
                )}
                <span
                  className={cn(
                    "text-[8px] font-bold uppercase tracking-tighter",
                    buildStatus === BuildStatus.FAILED
                      ? "text-destructive"
                      : "text-amber-500/90",
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
                className="text-[8px] text-muted-foreground/50 font-medium uppercase tracking-tighter"
              >
                {files.length} Files
              </m.span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
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
          <TabsList className="h-7 p-0.5 bg-workspace-sidebar border border-workspace-border/50 shrink-0">
            <TabsTrigger
              value="code"
              className="h-6 px-3 text-[10px] gap-1.5 font-semibold transition-all data-[state=active]:bg-workspace-bg data-[state=active]:text-primary"
            >
              Code
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="h-6 px-3 text-[10px] gap-1.5 font-semibold transition-all data-[state=active]:bg-workspace-bg data-[state=active]:text-primary"
            >
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="icon"
          onClick={closeSandbox}
          aria-label="Close workspace"
          className="h-7 w-7 rounded-lg hover:bg-foreground/[0.05]"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}