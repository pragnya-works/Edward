import type {
  StreamState,
} from "@edward/shared/chat/types";
import {
  BuildErrorReport,
  BuildRecordStatus,
} from "@edward/shared/api/contracts";
import { BuildStatus, SandboxMode } from "@/stores/sandbox/types";

export interface BuildStatusPayload {
  status?: BuildRecordStatus | null;
  previewUrl?: string | null;
  errorReport?: BuildErrorReport | null;
}

export interface UseSandboxBuildSyncParams {
  chatIdFromUrl: string | undefined;
  isSandboxOpen: boolean;
  stream: StreamState;
  buildStatus: BuildStatus;
  setFiles: (files: { path: string; content: string; isComplete: boolean }[]) => void;
  clearFiles: () => void;
  stopStreaming: () => void;
  openSandbox: (chatId?: string) => void;
  closeSandbox: () => void;
  setMode: (mode: SandboxMode) => void;
  setActiveFile: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setFullErrorReport: (report: BuildErrorReport | null) => void;
}

export const BUILD_POLL_INTERVAL_MS = 8_000;
export const BUILD_POLL_MAX_ATTEMPTS = 18;