import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type SyntheticEvent,
} from "react";
import { SandboxMode } from "@/stores/sandbox/types";
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
  type PreviewFrameState as PreviewFrameStateType,
  type PreviewHostCommand as PreviewHostCommandType,
} from "@/components/chat/sandbox/previewState";

interface UsePreviewNavigationParams {
  mode: SandboxMode;
  previewUrl: string | null;
}

export function usePreviewNavigation({ mode, previewUrl }: UsePreviewNavigationParams) {
  const [previewFrameState, dispatchPreviewFrame] = useReducer(
    previewFrameReducer,
    PreviewFrameState.IDLE,
  );
  const [previewNavigation, dispatchPreviewNavigation] = useReducer(
    previewNavigationReducer,
    PREVIEW_NAVIGATION_INITIAL_STATE,
  );
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current === null) {
      return;
    }
    clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = null;
  }, []);

  const previewAddress = previewNavigation.address;
  const canGoBack = previewNavigation.canGoBack;
  const canGoForward = previewNavigation.canGoForward;
  const isPreviewBridgeConnected = previewNavigation.isBridgeConnected;

  const previewOrigin = useMemo(
    () => getOriginFromAddress(previewUrl),
    [previewUrl],
  );

  const displayUrl = previewAddress ?? normalizePreviewAddress(previewUrl);
  const isPreviewLoading = previewFrameState === PreviewFrameState.LOADING;

  useEffect(() => {
    if (mode !== SandboxMode.PREVIEW || !previewUrl) {
      clearLoadingTimeout();
      dispatchPreviewFrame({ type: "RESET" });
      return;
    }

    clearLoadingTimeout();
    dispatchPreviewFrame({ type: "START_LOADING" });
    loadingTimeoutRef.current = setTimeout(() => {
      dispatchPreviewFrame({ type: "MARK_FAILED" });
    }, PREVIEW_EMBED_TIMEOUT_MS);

    return () => {
      clearLoadingTimeout();
    };
  }, [clearLoadingTimeout, mode, previewUrl]);

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
    const iframeWindow = previewFrameRef.current?.contentWindow;
    if (!iframeWindow) {
      return;
    }

    dispatchPreviewFrame({ type: "START_LOADING" });

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

  const handlePreviewFrameLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event.currentTarget;
    clearLoadingTimeout();

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
  }, [clearLoadingTimeout, previewUrl]);

  const markPreviewFailed = useCallback(() => {
    clearLoadingTimeout();
    dispatchPreviewFrame({ type: "MARK_FAILED" });
  }, [clearLoadingTimeout]);

  return {
    previewFrameState: previewFrameState as PreviewFrameStateType,
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
  };
}
