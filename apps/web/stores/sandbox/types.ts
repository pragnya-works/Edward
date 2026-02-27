import type { BuildErrorReport } from "@edward/shared/api/contracts";

export interface SandboxFile {
  path: string;
  content: string;
  isComplete: boolean;
}

export type SandboxTerminalEntryKind =
  | "system"
  | "command"
  | "warning"
  | "error"
  | "success";

export interface SandboxTerminalEntry {
  id: string;
  createdAt: number;
  kind: SandboxTerminalEntryKind;
  message: string;
  command?: string;
  args?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface SandboxTerminalEntryInput {
  kind: SandboxTerminalEntryKind;
  message: string;
  command?: string;
  args?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export enum SandboxMode {
  CODE = "code",
  PREVIEW = "preview",
}

export enum BuildStatus {
  IDLE = "idle",
  QUEUED = "queued",
  BUILDING = "building",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface SandboxDataState {
  routeChatId: string | null;
  isOpen: boolean;
  mode: SandboxMode;
  files: SandboxFile[];
  activeFilePath: string | null;
  previewUrl: string | null;
  buildStatus: BuildStatus;
  buildError: string | null;
  fullErrorReport: BuildErrorReport | null;
  isStreaming: boolean;
  streamingFilePath: string | null;
  localEdits: Map<string, string>;
  isSearchOpen: boolean;
  terminalEntries: SandboxTerminalEntry[];
  isTerminalOpen: boolean;
}

export interface SandboxUiSlice {
  setRouteChatId: (chatId: string | null) => void;
  openSandbox: (chatId?: string) => void;
  closeSandbox: () => void;
  toggleSandbox: (chatId?: string) => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setMode: (mode: SandboxMode) => void;
  setActiveFile: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
}

export interface SandboxFileSlice {
  updateFile: (file: SandboxFile) => void;
  setFiles: (files: SandboxFile[]) => void;
  startStreaming: (filePath: string) => void;
  stopStreaming: () => void;
  clearFiles: () => void;
  setLocalEdit: (path: string, content: string) => void;
  clearLocalEdit: (path: string) => void;
  clearAllLocalEdits: () => void;
  getFileContent: (path: string) => string;
}

export interface SandboxBuildSlice {
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setFullErrorReport: (report: BuildErrorReport | null) => void;
}

export interface SandboxTerminalSlice {
  appendTerminalEntry: (entry: SandboxTerminalEntryInput) => void;
  clearTerminalEntries: () => void;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminalOpen: () => void;
}

export interface SandboxStoreState
  extends SandboxDataState,
    SandboxUiSlice,
    SandboxFileSlice,
    SandboxBuildSlice,
    SandboxTerminalSlice {}
