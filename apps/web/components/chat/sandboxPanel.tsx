"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, PanelLeftOpen, RefreshCw, Search } from "lucide-react";
import { BuildStatus, SandboxMode, useSandbox } from "@/contexts/sandboxContext";
import { CodeEditor } from "@/components/chat/codeEditor";
import { SandboxHeader } from "@/components/chat/sandboxHeader";
import { SandboxFileSidebar } from "@/components/chat/sandboxFileSidebar";
import { SandboxEmptyState } from "@/components/chat/sandboxEmptyState";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { FileSearchModal } from "@/components/chat/fileSearchModal";
import { SandboxErrorBoundary } from "@/components/chat/sandboxErrorBoundary";
import { SandboxActivityBar } from "@/components/chat/sandboxActivityBar";
import { SandboxEditorTabs } from "@/components/chat/sandboxEditorTabs";
import { SandboxStatusBar } from "@/components/chat/sandboxStatusBar";
import { SandboxPreviewBar } from "@/components/chat/sandboxPreviewBar";
import { Button } from "@edward/ui/components/button";
import { Sheet, SheetContent } from "@edward/ui/components/sheet";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

interface SandboxPanelProps {
  projectName: string | null;
}

const PreviewFrameState = {
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
} as const;

const PREVIEW_EMBED_TIMEOUT_MS = 8000;
const PREVIEW_BRIDGE_SOURCE = "__edward_preview_bridge__";
const PREVIEW_BRIDGE_EVENT = "location-update";
const PREVIEW_BRIDGE_READY_EVENT = "preview-ready";
const PREVIEW_HOST_SOURCE = "__edward_preview_host__";

const PreviewHostCommand = {
  BACK: "navigate-back",
  FORWARD: "navigate-forward",
  RELOAD: "reload",
} as const;

type PreviewFrameState = (typeof PreviewFrameState)[keyof typeof PreviewFrameState];
type PreviewHostCommand =
  (typeof PreviewHostCommand)[keyof typeof PreviewHostCommand];

interface PreviewBridgeMessagePayload {
  source: string;
  type: string;
  href?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

type PreviewFrameAction =
  | { type: "RESET" }
  | { type: "START_LOADING" }
  | { type: "MARK_READY" }
  | { type: "MARK_FAILED" };

function previewFrameReducer(
  state: PreviewFrameState,
  action: PreviewFrameAction,
): PreviewFrameState {
  switch (action.type) {
    case "RESET":
      return PreviewFrameState.IDLE;
    case "START_LOADING":
      return PreviewFrameState.LOADING;
    case "MARK_READY":
      return PreviewFrameState.READY;
    case "MARK_FAILED":
      return state === PreviewFrameState.LOADING
        ? PreviewFrameState.FAILED
        : state;
    default:
      return state;
  }
}

function normalizePreviewAddress(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(`https://${url}`).toString();
    } catch {
      return null;
    }
  }
}

function getOriginFromAddress(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isTrustedPreviewMessageOrigin({
  messageOrigin,
  expectedPreviewOrigin,
  currentPreviewAddress,
  reportedHref,
}: {
  messageOrigin: string;
  expectedPreviewOrigin: string | null;
  currentPreviewAddress: string | null;
  reportedHref: string | null;
}): boolean {
  if (!messageOrigin || messageOrigin === "null") {
    return true;
  }

  const allowedOrigins = new Set<string>();
  const currentOrigin = getOriginFromAddress(currentPreviewAddress);
  const reportedOrigin = getOriginFromAddress(reportedHref);

  if (expectedPreviewOrigin) {
    allowedOrigins.add(expectedPreviewOrigin);
  }
  if (currentOrigin) {
    allowedOrigins.add(currentOrigin);
  }
  if (reportedOrigin) {
    allowedOrigins.add(reportedOrigin);
  }

  if (allowedOrigins.size === 0) {
    return true;
  }

  return allowedOrigins.has(messageOrigin);
}

export function SandboxPanel({ projectName }: SandboxPanelProps) {
  const params = useParams<{ id: string }>();
  const chatId = params.id;
  const [isMobileExplorerOpen, setIsMobileExplorerOpen] = useState(false);
  const [previewFrameState, dispatchPreviewFrame] = useReducer(
    previewFrameReducer,
    PreviewFrameState.IDLE,
  );
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [previewAddress, setPreviewAddress] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isPreviewBridgeConnected, setIsPreviewBridgeConnected] = useState(false);

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

  const isMobile = useIsMobileViewport();
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
    setPreviewAddress(normalizePreviewAddress(previewUrl));
    setCanGoBack(false);
    setCanGoForward(false);
    setIsPreviewBridgeConnected(false);
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
          reportedHref: href,
        })
      ) {
        return;
      }

      setIsPreviewBridgeConnected(true);

      if (href) {
        setPreviewAddress(href);
      }

      if (typeof data.canGoBack === "boolean") {
        setCanGoBack(data.canGoBack);
      }

      if (typeof data.canGoForward === "boolean") {
        setCanGoForward(data.canGoForward);
      }
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [previewAddress, previewOrigin]);

  const postPreviewCommand = useCallback((command: PreviewHostCommand): boolean => {
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow) {
      return false;
    }

    try {
      iframeWindow.postMessage(
        { source: PREVIEW_HOST_SOURCE, type: command },
        "*",
      );
      return true;
    } catch {
      return false;
    }
  }, []);

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

  return (
    <SandboxErrorBoundary>
      <div className="h-full flex flex-col bg-workspace-bg text-workspace-foreground overflow-hidden relative font-sans">
        <SandboxHeader projectName={projectName} />
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
            <div className="flex h-full w-full bg-workspace-bg">
              {isMobile ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center gap-2 justify-between border-b border-workspace-border bg-workspace-sidebar px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
                        onClick={() => setIsMobileExplorerOpen(true)}
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                        Explorer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
                        onClick={openSearch}
                      >
                        <Search className="h-3.5 w-3.5" />
                        Search
                      </Button>
                    </div>

                    {activeFile && (
                      <span className="text-[11px] font-mono text-workspace-foreground/80 truncate max-w-[42vw]">
                        {activeFile.path}
                      </span>
                    )}
                  </div>

                  <Sheet
                    open={isMobileExplorerOpen}
                    onOpenChange={setIsMobileExplorerOpen}
                  >
                    <SheetContent
                      side="left"
                      className="w-[82vw] max-w-sm p-0 gap-0 bg-workspace-sidebar border-workspace-border"
                    >
                      <SandboxFileSidebar chatId={chatId} />
                    </SheetContent>
                  </Sheet>

                  <div className="flex-1 min-h-0 flex flex-col bg-workspace-bg">
                    {editorSurface}
                  </div>
                </div>
              ) : (
                <>
                  <SandboxActivityBar />

                  <PanelGroup orientation="horizontal" className="flex-1 min-h-0 bg-workspace-bg select-none">
                    <Panel
                      minSize={100}
                      maxSize={200}
                      className="bg-workspace-sidebar"
                    >
                      <SandboxFileSidebar chatId={chatId} />
                    </Panel>

                    <PanelResizeHandle className="w-1 bg-workspace-border hover:bg-workspace-accent/60 transition-colors cursor-col-resize z-10 select-none hover:shadow-[inset_0_0_8px_rgba(79,193,255,0.15)]" />

                    <Panel className="flex flex-col bg-workspace-bg relative min-w-0">
                      {editorSurface}
                    </Panel>
                  </PanelGroup>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-workspace-bg">
              {previewUrl ? (
                previewFrameState === PreviewFrameState.FAILED ? (
                  <div className="flex-1 flex items-center justify-center text-workspace-foreground/50 bg-workspace-bg">
                    <div className="flex flex-col items-center gap-3 text-center px-6 max-w-md">
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                      <p className="text-sm text-workspace-foreground">
                        Preview could not be embedded in this panel.
                      </p>
                      <a
                        href={previewAddress ?? previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-md border border-workspace-border hover:bg-workspace-hover transition-colors text-workspace-foreground"
                      >
                        Open preview in new tab
                      </a>
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={previewFrameRef}
                    src={previewUrl}
                    title={`Sandbox preview for chat ${chatId}`}
                    className="flex-1 w-full"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={(event) => {
                      const iframe = event.currentTarget;

                      try {
                        // If frame blocking occurs, many browsers leave iframe
                        // on about:blank (same-origin to parent), which we can detect.
                        const href = iframe.contentWindow?.location?.href;
                        if (!href || href === "about:blank") {
                          dispatchPreviewFrame({ type: "MARK_FAILED" });
                          return;
                        }

                        const normalizedHref = normalizePreviewAddress(href);
                        if (normalizedHref) {
                          setPreviewAddress(normalizedHref);
                        }
                        dispatchPreviewFrame({ type: "MARK_READY" });
                      } catch {
                        // Cross-origin location access throws when a real external
                        // preview is loaded, which is the expected success path.
                        setPreviewAddress((previous) =>
                          previous ?? normalizePreviewAddress(previewUrl),
                        );
                        dispatchPreviewFrame({ type: "MARK_READY" });
                      }
                    }}
                    onError={() => dispatchPreviewFrame({ type: "MARK_FAILED" })}
                  />
                )
              ) : (
                <div className="flex-1 flex items-center justify-center text-workspace-foreground/50 bg-workspace-bg">
                  {buildStatus === BuildStatus.FAILED ? (
                    <div className="flex flex-col items-center gap-4 text-center px-6 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                        <AlertTriangle className="h-7 w-7 text-destructive" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-workspace-foreground">Build Failed</p>
                        <p className="text-[11px] text-workspace-foreground/50 leading-relaxed">
                          The preview is unavailable because the build encountered errors. Switch to the{" "}
                          <button
                            type="button"
                            onClick={() => setMode(SandboxMode.CODE)}
                            className="text-workspace-accent font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
                          >
                            Code
                          </button>{" "}
                          tab to inspect the output.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin-slow opacity-30 text-workspace-accent" />
                      <span className="text-[11px] font-medium">
                        {buildStatus === BuildStatus.QUEUED
                          ? "Queued for build..."
                          : "Wait for build..."}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <SandboxStatusBar />
        <FileSearchModal />
      </div>
    </SandboxErrorBoundary>
  );
}
