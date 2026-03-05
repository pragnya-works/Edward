import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SandboxStoreState } from "./types";
import { useSandboxStore } from "./store";

export type SandboxStateHookReturn = Pick<
  SandboxStoreState,
  | "isOpen"
  | "mode"
  | "files"
  | "activeFilePath"
  | "previewUrl"
  | "buildStatus"
  | "buildError"
  | "fullErrorReport"
  | "isStreaming"
  | "streamingFilePath"
  | "localEdits"
  | "isSearchOpen"
  | "terminalEntries"
  | "isTerminalOpen"
>;

export type SandboxActionsHookReturn = Pick<
  SandboxStoreState,
  | "setRouteChatId"
  | "openSandbox"
  | "closeSandbox"
  | "toggleSandbox"
  | "openSearch"
  | "closeSearch"
  | "toggleSearch"
  | "setMode"
  | "setActiveFile"
  | "setPreviewUrl"
  | "updateFile"
  | "setFiles"
  | "startStreaming"
  | "stopStreaming"
  | "clearFiles"
  | "setLocalEdit"
  | "clearLocalEdit"
  | "clearAllLocalEdits"
  | "getFileContent"
  | "setBuildStatus"
  | "setBuildError"
  | "setFullErrorReport"
  | "appendTerminalEntry"
  | "clearTerminalEntries"
  | "setTerminalOpen"
  | "toggleTerminalOpen"
>;

export interface SandboxHookReturn
  extends SandboxStateHookReturn,
    SandboxActionsHookReturn {}

export function useSandboxIsOpen(): boolean {
  return useSandboxStore((s) => s.isOpen);
}

export function useSandboxState(): SandboxStateHookReturn {
  return useSandboxStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      mode: s.mode,
      files: s.files,
      activeFilePath: s.activeFilePath,
      previewUrl: s.previewUrl,
      buildStatus: s.buildStatus,
      buildError: s.buildError,
      fullErrorReport: s.fullErrorReport,
      isStreaming: s.isStreaming,
      streamingFilePath: s.streamingFilePath,
      localEdits: s.localEdits,
      isSearchOpen: s.isSearchOpen,
      terminalEntries: s.terminalEntries,
      isTerminalOpen: s.isTerminalOpen,
    })),
  );
}

export function useSandboxActions(): SandboxActionsHookReturn {
  return useSandboxStore(
    useShallow((s) => ({
      setRouteChatId: s.setRouteChatId,
      openSandbox: s.openSandbox,
      closeSandbox: s.closeSandbox,
      toggleSandbox: s.toggleSandbox,
      openSearch: s.openSearch,
      closeSearch: s.closeSearch,
      toggleSearch: s.toggleSearch,
      setMode: s.setMode,
      setActiveFile: s.setActiveFile,
      setPreviewUrl: s.setPreviewUrl,
      updateFile: s.updateFile,
      setFiles: s.setFiles,
      startStreaming: s.startStreaming,
      stopStreaming: s.stopStreaming,
      clearFiles: s.clearFiles,
      setLocalEdit: s.setLocalEdit,
      clearLocalEdit: s.clearLocalEdit,
      clearAllLocalEdits: s.clearAllLocalEdits,
      getFileContent: s.getFileContent,
      setBuildStatus: s.setBuildStatus,
      setBuildError: s.setBuildError,
      setFullErrorReport: s.setFullErrorReport,
      appendTerminalEntry: s.appendTerminalEntry,
      clearTerminalEntries: s.clearTerminalEntries,
      setTerminalOpen: s.setTerminalOpen,
      toggleTerminalOpen: s.toggleTerminalOpen,
    })),
  );
}

export function useSandbox(): SandboxHookReturn {
  const sandboxState = useSandboxState();
  const sandboxActions = useSandboxActions();

  return useMemo(
    () => ({
      ...sandboxState,
      ...sandboxActions,
    }),
    [sandboxActions, sandboxState],
  );
}
