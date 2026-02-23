"use client";

import { useSandbox, BuildStatus } from "@/contexts/sandboxContext";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  PanelLeft,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { Badge } from "@edward/ui/components/badge";
import { Separator } from "@edward/ui/components/separator";

export function SandboxStatusBar() {
  const { activeFilePath, buildStatus, files } = useSandbox();

  const activeFile = activeFilePath
    ? files.find((f) => f.path === activeFilePath)
    : null;

  const buildLabel =
    buildStatus === BuildStatus.BUILDING
      ? "Building"
      : buildStatus === BuildStatus.FAILED
        ? "Failed"
        : buildStatus === BuildStatus.SUCCESS
          ? "Running"
          : buildStatus === BuildStatus.QUEUED
            ? "Queued"
            : "Idle";

  const language = activeFile
    ? activeFile.path.endsWith(".tsx") || activeFile.path.endsWith(".ts")
      ? "TypeScript React"
      : activeFile.path.endsWith(".css")
        ? "CSS"
        : activeFile.path.endsWith(".json")
          ? "JSON"
          : "Plain Text"
    : "No active file";

  return (
    <div className="h-6 bg-workspace-status-bg text-workspace-status-fg flex items-center justify-between px-2 text-[10px] md:text-[11px] select-none z-50 shrink-0 font-sans gap-2 border-t border-workspace-border/20">
      <div className="flex items-center gap-2 h-full min-w-0">
        <div className="flex items-center justify-center bg-workspace-status-fg/15 text-workspace-status-fg h-full px-2 -ml-2">
          <PanelLeft className="h-3 w-3" />
        </div>

        <Badge
          variant="secondary"
          className="h-4 rounded-sm border-0 bg-workspace-status-fg/15 text-workspace-status-fg hover:bg-workspace-status-fg/15 px-1.5 gap-1"
        >
          {buildStatus === BuildStatus.SUCCESS ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : buildStatus === BuildStatus.FAILED ? (
            <XCircle className="h-3 w-3" />
          ) : buildStatus === BuildStatus.BUILDING ||
            buildStatus === BuildStatus.QUEUED ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          <span>{buildLabel}</span>
        </Badge>
      </div>

      <div className="flex items-center gap-2 h-full min-w-0">
        {activeFile && (
          <div className="hidden md:flex items-center gap-2 text-workspace-status-fg/90">
            <span>Ln 1, Col 1</span>
            <Separator orientation="vertical" className="h-3 bg-workspace-status-fg/30" />
            <span>Spaces: 2</span>
            <Separator orientation="vertical" className="h-3 bg-workspace-status-fg/30" />
            <span>UTF-8</span>
            <Separator orientation="vertical" className="h-3 bg-workspace-status-fg/30" />
            <span>LF</span>
          </div>
        )}
        <span
          className={cn(
            "font-medium truncate max-w-[45vw] md:max-w-none",
            !activeFile && "text-workspace-status-fg/80",
          )}
        >
          {language}
        </span>
      </div>
    </div>
  );
}
