"use client";

import { useSandbox } from "@/contexts/sandboxContext";
import { X, ChevronRight } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import { Separator } from "@edward/ui/components/separator";
import { VscodeFileIcon } from "./vscodeFileIcon";

export function SandboxEditorTabs() {
  const { activeFilePath, setActiveFile } = useSandbox();

  if (!activeFilePath) return null;

  return (
    <div className="flex flex-col w-full shrink-0 relative bg-workspace-sidebar border-b border-workspace-border">
      <div className="flex items-end h-9 overflow-x-auto overflow-y-hidden no-scrollbar bg-workspace-sidebar pr-2">
        <div
          className={cn(
            "group flex items-center gap-1.5 h-9 px-3 max-w-[360px] min-w-[140px] select-none border-t border-r relative",
            "bg-workspace-bg text-workspace-foreground border-workspace-accent/70 border-r-workspace-border",
          )}
        >
          <VscodeFileIcon path={activeFilePath} className="h-3.5 w-3.5" />
          <span className="text-[12px] truncate font-mono tracking-tight">
            {activeFilePath}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100 hover:bg-workspace-hover rounded-sm transition-all text-workspace-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setActiveFile(null);
            }}
            aria-label="Close active file"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator className="bg-workspace-border" />

      <div className="h-7 bg-workspace-bg flex items-center gap-1 px-3 text-[11px] text-white/50 font-mono">
        <span className="truncate">root</span>
        <ChevronRight className="h-3 w-3 opacity-60 shrink-0" />
        <span className="truncate text-white">{activeFilePath}</span>
      </div>
    </div>
  );
}
