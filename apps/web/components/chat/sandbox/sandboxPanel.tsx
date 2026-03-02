"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useSandbox } from "@/contexts/sandboxContext";
import { SandboxMode } from "@/stores/sandbox/types";
import { CodeEditor } from "@/components/chat/editor/codeEditor";
import { FileSearchModal } from "@/components/chat/editor/fileSearchModal";
import { SandboxEditorTabs } from "@/components/chat/sandbox/sandboxEditorTabs";
import { SandboxEmptyState } from "@/components/chat/sandbox/sandboxEmptyState";
import { SandboxErrorBoundary } from "@/components/chat/sandbox/sandboxErrorBoundary";
import { SandboxHeader } from "@/components/chat/sandbox/sandboxHeader";
import { SandboxOutputTerminal } from "@/components/chat/sandbox/sandboxOutputTerminal";
import { SandboxPreviewBar } from "@/components/chat/sandbox/sandboxPreviewBar";
import { SandboxStatusBar } from "@/components/chat/sandbox/sandboxStatusBar";
import { CodeWorkspace } from "@/components/chat/sandbox/codeWorkspace";
import { PreviewWorkspace } from "@/components/chat/sandbox/previewWorkspace";
import { usePreviewNavigation } from "@/hooks/chat/usePreviewNavigation";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";
import { useOptionalChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";

export function SandboxPanel() {
  const [isMobileExplorerOpen, setIsMobileExplorerOpen] = useState(false);
  const workspace = useOptionalChatWorkspaceContext();

  const {
    mode,
    files,
    activeFilePath,
    previewUrl,
    buildStatus,
    isStreaming,
    streamingFilePath,
    getFileContent,
    openSearch,
    setMode,
  } = useSandbox();

  const {
    previewFrameState,
    previewFrameRef,
    previewAddress,
    displayUrl,
    canGoBack,
    canGoForward,
    isPreviewLoading,
    navigatePreviewBack,
    navigatePreviewForward,
    openPreviewInNewTab,
    refreshPreview,
    handlePreviewFrameLoad,
    markPreviewFailed,
  } = usePreviewNavigation({ mode, previewUrl });

  const activeFile = useMemo(
    () => (activeFilePath ? files.find((file) => file.path === activeFilePath) : null),
    [activeFilePath, files],
  );

  const isMobile = useMobileViewport();
  const isInstallingDependencies =
    (workspace?.stream.installingDeps.length ?? 0) > 0;

  const switchToCodeMode = useCallback(() => setMode(SandboxMode.CODE), [setMode]);

  const editorSurface = activeFile ? (
    <>
      <SandboxEditorTabs />
      <div className="flex-1 min-h-0 relative">
        <CodeEditor
          code={getFileContent(activeFile.path)}
          filename={activeFile.path}
          isStreaming={isStreaming && streamingFilePath === activeFile.path}
          isInstallingDependencies={isInstallingDependencies}
          buildStatus={buildStatus}
        />
      </div>
    </>
  ) : (
    <SandboxEmptyState />
  );

  return (
    <SandboxErrorBoundary>
      <div className="h-full flex flex-col bg-workspace-bg text-workspace-foreground overflow-hidden relative font-sans">
        <SandboxHeader />
        {mode === SandboxMode.PREVIEW ? (
          <SandboxPreviewBar
            url={displayUrl}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            isRefreshing={isPreviewLoading}
            onBack={navigatePreviewBack}
            onForward={navigatePreviewForward}
            onOpenInNewTab={openPreviewInNewTab}
            onRefresh={refreshPreview}
          />
        ) : null}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {mode === SandboxMode.CODE ? (
            <CodeWorkspace
              isMobile={isMobile}
              isMobileExplorerOpen={isMobileExplorerOpen}
              setIsMobileExplorerOpen={setIsMobileExplorerOpen}
              openSearch={openSearch}
              activeFilePath={activeFile?.path ?? null}
              editorSurface={editorSurface}
            />
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-workspace-bg">
              <PreviewWorkspace
                previewUrl={previewUrl}
                previewAddress={previewAddress}
                previewFrameState={previewFrameState}
                previewFrameRef={previewFrameRef}
                buildStatus={buildStatus}
                isStreaming={isStreaming}
                onSwitchToCode={switchToCodeMode}
                onPreviewLoad={handlePreviewFrameLoad}
                onPreviewError={markPreviewFailed}
              />
            </div>
          )}
        </div>

        <SandboxOutputTerminal />
        <SandboxStatusBar />
        <FileSearchModal />
      </div>
    </SandboxErrorBoundary>
  );
}
