import {
  BuildStatus,
  SandboxMode,
  type SandboxDataState,
} from "./types";

export const INITIAL_SANDBOX_STATE: SandboxDataState = {
  isOpen: false,
  mode: SandboxMode.CODE,
  files: [],
  activeFilePath: null,
  previewUrl: null,
  buildStatus: BuildStatus.IDLE,
  buildError: null,
  fullErrorReport: null,
  isStreaming: false,
  streamingFilePath: null,
  localEdits: new Map(),
  isSearchOpen: false,
};

export function sanitizePreviewUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}
