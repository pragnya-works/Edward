import { useShallow } from "zustand/react/shallow";
import { useSandboxStore } from "./store";

export function useSandboxIsOpen() {
  return useSandboxStore((s) => s.isOpen);
}

export function useSandbox() {
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
