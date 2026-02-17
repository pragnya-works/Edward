"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, FileCode } from "lucide-react";
import { BuildStatus, SandboxMode, useSandbox } from "@/contexts/sandboxContext";
import { CodeEditor } from "@/components/chat/codeEditor";
import { SandboxHeader } from "@/components/chat/sandboxHeader";
import { SandboxFileSidebar } from "@/components/chat/sandboxFileSidebar";
import { SandboxEmptyState } from "@/components/chat/sandboxEmptyState";

export function SandboxPanel() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;

  const {
    mode,
    files,
    activeFilePath,
    previewUrl,
    buildStatus,
    isStreaming,
    streamingFilePath,
    getFileContent,
  } = useSandbox();

  const activeFile = useMemo(
    () => (activeFilePath ? files.find((file) => file.path === activeFilePath) : null),
    [activeFilePath, files],
  );

  return (
    <div className="h-full flex flex-col bg-workspace-bg text-workspace-foreground overflow-hidden relative">
      <SandboxHeader />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {mode === SandboxMode.CODE ? (
          <div className="flex-1 min-h-0 flex bg-workspace-sidebar">
            <SandboxFileSidebar chatId={chatId} />

            <div className="flex-1 min-h-0 flex flex-col bg-workspace-bg relative">
              {activeFile ? (
                <>
                  <div className="px-4 py-2 border-b border-workspace-border bg-workspace-header/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCode className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">
                        {activeFile.path}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0">
                    <CodeEditor
                      code={getFileContent(activeFile.path)}
                      filename={activeFile.path}
                      isStreaming={isStreaming && streamingFilePath === activeFile.path}
                      buildStatus={buildStatus}
                    />
                  </div>
                </>
              ) : (
                <SandboxEmptyState />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col bg-white">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="flex-1 w-full"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/40 bg-foreground/[0.01]">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin-slow opacity-20" />
                  <span className="text-[11px] font-medium">
                    {buildStatus === BuildStatus.QUEUED
                      ? "Queued for build..."
                      : "Wait for build..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}