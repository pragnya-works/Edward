"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type SyntheticEvent,
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
import {
  PREVIEW_BRIDGE_EVENT,
  PREVIEW_BRIDGE_READY_EVENT,
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_EMBED_TIMEOUT_MS,
  PREVIEW_HOST_SOURCE,
  PREVIEW_NAVIGATION_INITIAL_STATE,
  PreviewFrameState,
  PreviewHostCommand,
  getOriginFromAddress,
  isTrustedPreviewMessageOrigin,
  normalizePreviewAddress,
  previewFrameReducer,
  previewNavigationReducer,
  type PreviewBridgeMessagePayload,
  type PreviewHostCommand as PreviewHostCommandType,
} from "@/components/chat/sandbox/previewState";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";

export function SandboxPanel() {
  const [isMobileExplorerOpen, setIsMobileExplorerOpen] = useState(false);
  const [previewFrameState, dispatchPreviewFrame] = useReducer(
    previewFrameReducer,
    PreviewFrameState.IDLE,
  );
  const [previewNavigation, dispatchPreviewNavigation] = useReducer(
    previewNavigationReducer,
    PREVIEW_NAVIGATION_INITIAL_STATE,
  );
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const previewAddress = previewNavigation.address;
  const canGoBack = previewNavigation.canGoBack;
  const canGoForward = previewNavigation.canGoForward;
  const isPreviewBridgeConnected = previewNavigation.isBridgeConnected;

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

  const activeFile = useMemo(
    () => (activeFilePath ? files.find((file) => file.path === activeFilePath) : null),
    [activeFilePath, files],
  );

  const isMobile = useMobileViewport();
  const previewOrigin = useMemo(
    () => getOriginFromAddress(previewUrl),
    [previewUrl],
  );

  useEffect(() => {
    if (mode !== SandboxMode.PREVIEW || !previewUrl) {
      dispatchPreviewFrame({ type: "RESET" });
      return;
    }

    dispatchPreviewFrame({ type: "START_LOADING" });
    const timeoutId = setTimeout(() => {
      dispatchPreviewFrame({ type: "MARK_FAILED" });
    }, PREVIEW_EMBED_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [mode, previewUrl]);

  useEffect(() => {
    dispatchPreviewNavigation({ type: "RESET_FROM_URL", previewUrl });
  }, [previewUrl]);

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      const iframeWindow = previewFrameRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      if (!event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as Partial<PreviewBridgeMessagePayload>;
      if (
        data.source !== PREVIEW_BRIDGE_SOURCE ||
        (data.type !== PREVIEW_BRIDGE_EVENT &&
          data.type !== PREVIEW_BRIDGE_READY_EVENT)
      ) {
        return;
      }

      const href =
        typeof data.href === "string"
          ? normalizePreviewAddress(data.href)
          : null;

      if (
        !isTrustedPreviewMessageOrigin({
          messageOrigin: event.origin,
          expectedPreviewOrigin: previewOrigin,
          currentPreviewAddress: previewAddress,
        })
      ) {
        return;
      }

      dispatchPreviewNavigation({
        type: "UPDATE_FROM_BRIDGE",
        href,
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward,
      });
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [previewAddress, previewOrigin]);

  const postPreviewCommand = useCallback((command: PreviewHostCommandType): boolean => {
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow || !previewOrigin) {
      return false;
    }

    try {
      iframeWindow.postMessage(
        { source: PREVIEW_HOST_SOURCE, type: command },
        previewOrigin,
      );
      return true;
    } catch {
      return false;
    }
  }, [previewOrigin]);

  const openPreviewInNewTab = useCallback(() => {
    const url = previewAddress ?? normalizePreviewAddress(previewUrl);
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [previewAddress, previewUrl]);

  const navigatePreviewBack = useCallback(() => {
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow) {
      return;
    }

    if (isPreviewBridgeConnected && postPreviewCommand(PreviewHostCommand.BACK)) {
      return;
    }

    try {
      iframeWindow.history.back();
    } catch {
      // Ignore fallback failures; bridge command is the primary path.
    }
  }, [isPreviewBridgeConnected, postPreviewCommand]);

  const navigatePreviewForward = useCallback(() => {
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow) {
      return;
    }

    if (
      isPreviewBridgeConnected &&
      postPreviewCommand(PreviewHostCommand.FORWARD)
    ) {
      return;
    }

    try {
      iframeWindow.history.forward();
    } catch {
      // Ignore fallback failures; bridge command is the primary path.
    }
  }, [isPreviewBridgeConnected, postPreviewCommand]);

  const refreshPreview = useCallback(() => {
    dispatchPreviewFrame({ type: "START_LOADING" });
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow) {
      return;
    }

    if (isPreviewBridgeConnected && postPreviewCommand(PreviewHostCommand.RELOAD)) {
      return;
    }

    try {
      iframeWindow.location.reload();
      return;
    } catch {
      // Continue with src reset fallback.
    }

    const url = previewAddress ?? normalizePreviewAddress(previewUrl);
    if (url && previewFrameRef.current) {
      previewFrameRef.current.src = url;
    }
  }, [isPreviewBridgeConnected, postPreviewCommand, previewAddress, previewUrl]);

  const editorSurface = activeFile ? (
    <>
      <SandboxEditorTabs />
      <div className="flex-1 min-h-0 relative">
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
  );

  const handlePreviewFrameLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event.currentTarget;

    try {
      const href = iframe.contentWindow?.location?.href;
      if (!href || href === "about:blank") {
        dispatchPreviewFrame({ type: "MARK_FAILED" });
        return;
      }

      const normalizedHref = normalizePreviewAddress(href);
      if (normalizedHref) {
        dispatchPreviewNavigation({
          type: "SET_ADDRESS",
          address: normalizedHref,
        });
      }
      dispatchPreviewFrame({ type: "MARK_READY" });
    } catch {
      dispatchPreviewNavigation({
        type: "SET_ADDRESS_IF_EMPTY",
        address: normalizePreviewAddress(previewUrl),
      });
      dispatchPreviewFrame({ type: "MARK_READY" });
    }
  }, [previewUrl]);

  return (
    <SandboxErrorBoundary>
      <div className="h-full flex flex-col bg-workspace-bg text-workspace-foreground overflow-hidden relative font-sans">
        <SandboxHeader />
        {mode === SandboxMode.PREVIEW ? (
          <SandboxPreviewBar
            url={previewAddress ?? normalizePreviewAddress(previewUrl)}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
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
                onSwitchToCode={() => setMode(SandboxMode.CODE)}
                onPreviewLoad={handlePreviewFrameLoad}
                onPreviewError={() => dispatchPreviewFrame({ type: "MARK_FAILED" })}
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
