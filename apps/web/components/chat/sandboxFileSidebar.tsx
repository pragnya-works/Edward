"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Folder } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";
import { getSandboxFiles } from "@/lib/api";
import { useSandbox } from "@/contexts/sandboxContext";
import { buildFileTree } from "./fileTree";
import { FileTreeView } from "./fileTreeItem";

interface SandboxFileSidebarProps {
  chatId: string;
}

export function SandboxFileSidebar({ chatId }: SandboxFileSidebarProps) {
  const {
    files,
    activeFilePath,
    streamingFilePath,
    setActiveFile,
    setFiles,
  } = useSandbox();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const handleRefreshFiles = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const response = await getSandboxFiles(chatId);
      const { files: fetchedFiles } = response.data;

      if (fetchedFiles && fetchedFiles.length > 0) {
        setFiles(fetchedFiles);
      }
    } catch (error) {
      console.error("Failed to refresh sandbox files:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [chatId, isRefreshing, setFiles]);

  if (files.length === 0) {
    return (
      <div className="w-52 shrink-0 border-r border-workspace-border overflow-y-auto bg-workspace-sidebar flex flex-col">
        <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-workspace-border flex items-center justify-between sticky top-0 bg-workspace-sidebar z-10">
          <div className="flex items-center gap-1.5">
            <Folder className="h-3 w-3" />
            Files
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshFiles}
            aria-label="Refresh files"
            disabled={isRefreshing}
            className="h-5 w-5 hover:bg-foreground/[0.05]"
          >
            <RefreshCw
              className={cn("h-2.5 w-2.5", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center bg-workspace-bg">
          <div className="flex flex-col items-center gap-3 w-full max-w-md px-6 text-center text-workspace-foreground">
            <p className="text-sm">No files found in the sandbox.</p>
            <Button
              variant="secondary"
              onClick={handleRefreshFiles}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Files"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-52 shrink-0 border-r border-workspace-border overflow-y-auto bg-workspace-sidebar flex flex-col">
      <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-workspace-border flex items-center justify-between sticky top-0 bg-workspace-sidebar z-10">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3 w-3" />
          Files
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefreshFiles}
          aria-label="Refresh files"
          disabled={isRefreshing}
          className="h-5 w-5 hover:bg-foreground/[0.05]"
        >
          <RefreshCw
            className={cn("h-2.5 w-2.5", isRefreshing && "animate-spin")}
          />
        </Button>
      </div>

      <FileTreeView
        nodes={fileTree}
        activeFilePath={activeFilePath}
        streamingFilePath={streamingFilePath}
        onSelect={setActiveFile}
      />
    </div>
  );
}