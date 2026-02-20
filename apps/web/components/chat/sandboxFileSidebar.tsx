"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { Separator } from "@edward/ui/components/separator";
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
    openSearch,
  } = useSandbox();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);

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
      <div className="w-full h-full border-r border-workspace-border overflow-y-auto bg-workspace-sidebar flex flex-col font-sans">
        <div className="px-3 py-2 text-[11px] font-bold text-workspace-foreground/80 tracking-wide flex items-center justify-between sticky top-0 bg-workspace-sidebar z-10">
          <div className="flex items-center gap-1.5 uppercase translate-y-[1px]">
            EXPLORER
          </div>
          <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={openSearch}
              aria-label="Search files"
              className="h-5 w-5 hover:bg-workspace-hover text-workspace-foreground"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshFiles}
              aria-label="Refresh files"
              disabled={isRefreshing}
              className="h-5 w-5 hover:bg-workspace-hover text-workspace-foreground"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>
        <Separator className="bg-workspace-border" />
        <div className="flex-1 flex items-center justify-center bg-workspace-sidebar">
          <div className="flex flex-col items-center gap-3 w-full max-w-md px-6 text-center text-workspace-foreground">
            <p className="text-sm">No files found in the sandbox.</p>
            <Button
              variant="outline"
              onClick={handleRefreshFiles}
              disabled={isRefreshing}
              className="bg-workspace-bg border-workspace-border text-workspace-foreground hover:bg-workspace-hover"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Files"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isRootNodePresent = fileTree.length === 1 && fileTree[0]?.name === "root";
  const displayNodes = isRootNodePresent ? fileTree[0]?.children || [] : fileTree;

  return (
    <div className="w-full h-full border-r border-workspace-border overflow-y-auto bg-workspace-sidebar flex flex-col font-sans group/sidebar text-workspace-foreground">
      <div className="px-3 py-2 text-[11px] font-bold text-workspace-foreground/80 tracking-wide flex items-center justify-between sticky top-0 bg-workspace-sidebar z-10">
        <div className="flex items-center gap-1.5 uppercase translate-y-[1px]">
          EXPLORER
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={openSearch}
            aria-label="Search files"
            className="h-5 w-5 hover:bg-workspace-hover text-workspace-foreground -mr-1"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshFiles}
            aria-label="Refresh files"
            disabled={isRefreshing}
            className="h-5 w-5 hover:bg-workspace-hover text-workspace-foreground"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
      </div>
      <Separator className="bg-workspace-border" />

      {isRootNodePresent && (
        <Button
          type="button"
          variant="ghost"
          className="w-full h-auto justify-start px-2 py-1.5 flex items-center gap-1 text-[11px] font-bold text-workspace-foreground/85 tracking-wide uppercase hover:bg-workspace-hover rounded-none"
          onClick={() => setIsWorkspaceExpanded((prev) => !prev)}
          aria-expanded={isWorkspaceExpanded}
          aria-label="Toggle workspace files"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform",
              isWorkspaceExpanded && "rotate-90",
            )}
          />
          WORKSPACE
        </Button>
      )}

      {(!isRootNodePresent || isWorkspaceExpanded) && (
        <FileTreeView
          nodes={displayNodes}
          activeFilePath={activeFilePath}
          streamingFilePath={streamingFilePath}
          onSelect={setActiveFile}
        />
      )}
    </div>
  );
}
