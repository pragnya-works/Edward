export type PreviewFrameState = "idle" | "loading" | "ready" | "failed";

export type PreviewHostCommand =
  | "navigate-back"
  | "navigate-forward"
  | "reload";

export interface PreviewBridgeMessagePayload {
  source: string;
  type: string;
  href?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export type PreviewFrameAction =
  | { type: "RESET" }
  | { type: "START_LOADING" }
  | { type: "MARK_READY" }
  | { type: "MARK_FAILED" };

export interface PreviewNavigationState {
  address: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  isBridgeConnected: boolean;
}

export type PreviewNavigationAction =
  | { type: "RESET_FROM_URL"; previewUrl: string | null | undefined }
  | { type: "SET_ADDRESS"; address: string | null }
  | { type: "SET_ADDRESS_IF_EMPTY"; address: string | null }
  | {
    type: "UPDATE_FROM_BRIDGE";
    href: string | null;
    canGoBack?: boolean;
    canGoForward?: boolean;
  };

export const PREVIEW_EMBED_TIMEOUT_MS = 8000;
export const PREVIEW_BRIDGE_SOURCE = "__edward_preview_bridge__";
export const PREVIEW_BRIDGE_EVENT = "location-update";
export const PREVIEW_BRIDGE_READY_EVENT = "preview-ready";
export const PREVIEW_HOST_SOURCE = "__edward_preview_host__";

export const PreviewFrameState = {
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
} as const;

export const PreviewHostCommand = {
  BACK: "navigate-back",
  FORWARD: "navigate-forward",
  RELOAD: "reload",
} as const;

export const PREVIEW_NAVIGATION_INITIAL_STATE: PreviewNavigationState = {
  address: null,
  canGoBack: false,
  canGoForward: false,
  isBridgeConnected: false,
};

export function previewFrameReducer(
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

export function previewNavigationReducer(
  state: PreviewNavigationState,
  action: PreviewNavigationAction,
): PreviewNavigationState {
  switch (action.type) {
    case "RESET_FROM_URL":
      return {
        address: normalizePreviewAddress(action.previewUrl),
        canGoBack: false,
        canGoForward: false,
        isBridgeConnected: false,
      };
    case "SET_ADDRESS":
      return {
        ...state,
        address: action.address,
      };
    case "SET_ADDRESS_IF_EMPTY":
      if (state.address) {
        return state;
      }
      return {
        ...state,
        address: action.address,
      };
    case "UPDATE_FROM_BRIDGE":
      return {
        ...state,
        isBridgeConnected: true,
        address: action.href ?? state.address,
        canGoBack:
          typeof action.canGoBack === "boolean"
            ? action.canGoBack
            : state.canGoBack,
        canGoForward:
          typeof action.canGoForward === "boolean"
            ? action.canGoForward
            : state.canGoForward,
      };
    default:
      return state;
  }
}

export function normalizePreviewAddress(
  url: string | null | undefined,
): string | null {
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

export function getOriginFromAddress(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isTrustedPreviewMessageOrigin({
  messageOrigin,
  expectedPreviewOrigin,
  currentPreviewAddress,
}: {
  messageOrigin: string;
  expectedPreviewOrigin: string | null;
  currentPreviewAddress: string | null;
}): boolean {
  if (!messageOrigin || messageOrigin === "null") {
    return true;
  }

  const allowedOrigins = new Set<string>();
  const currentOrigin = getOriginFromAddress(currentPreviewAddress);

  if (expectedPreviewOrigin) {
    allowedOrigins.add(expectedPreviewOrigin);
  }
  if (currentOrigin) {
    allowedOrigins.add(currentOrigin);
  }

  if (allowedOrigins.size === 0) {
    return true;
  }

  return allowedOrigins.has(messageOrigin);
}
