"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import {
  useSandboxStore,
} from "@/stores/sandbox/store";

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function SandboxProvider({ children }: { children: ReactNode }) {
  const isOpen = useSandboxStore((state) => state.isOpen);
  const closeSandbox = useSandboxStore((state) => state.closeSandbox);
  const toggleSearch = useSandboxStore((state) => state.toggleSearch);
  const setRouteChatId = useSandboxStore((state) => state.setRouteChatId);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const match = pathname.match(/^\/chat\/([^/?#]+)/);
    let nextChatId: string | null = null;
    if (match?.[1]) {
      try {
        nextChatId = decodeURIComponent(match[1]);
      } catch {
        nextChatId = match[1];
      }
    }
    closeSandbox();
    setRouteChatId(nextChatId);
  }, [closeSandbox, pathname, setRouteChatId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "p") {
        return;
      }
      if (event.shiftKey) {
        return;
      }
      if (isOpen) {
        event.preventDefault();
        toggleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, toggleSearch]);

  return children;
}

export function useSandbox() {
  return useSandboxStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      mode: state.mode,
      files: state.files,
      activeFilePath: state.activeFilePath,
      previewUrl: state.previewUrl,
      buildStatus: state.buildStatus,
      buildError: state.buildError,
      fullErrorReport: state.fullErrorReport,
      isStreaming: state.isStreaming,
      streamingFilePath: state.streamingFilePath,
      localEdits: state.localEdits,
      isSearchOpen: state.isSearchOpen,
      terminalEntries: state.terminalEntries,
      isTerminalOpen: state.isTerminalOpen,
      setRouteChatId: state.setRouteChatId,
      openSandbox: state.openSandbox,
      closeSandbox: state.closeSandbox,
      toggleSandbox: state.toggleSandbox,
      openSearch: state.openSearch,
      closeSearch: state.closeSearch,
      toggleSearch: state.toggleSearch,
      setMode: state.setMode,
      setActiveFile: state.setActiveFile,
      setPreviewUrl: state.setPreviewUrl,
      updateFile: state.updateFile,
      setFiles: state.setFiles,
      startStreaming: state.startStreaming,
      stopStreaming: state.stopStreaming,
      clearFiles: state.clearFiles,
      setLocalEdit: state.setLocalEdit,
      clearLocalEdit: state.clearLocalEdit,
      clearAllLocalEdits: state.clearAllLocalEdits,
      getFileContent: state.getFileContent,
      setBuildStatus: state.setBuildStatus,
      setBuildError: state.setBuildError,
      setFullErrorReport: state.setFullErrorReport,
      appendTerminalEntry: state.appendTerminalEntry,
      clearTerminalEntries: state.clearTerminalEntries,
      setTerminalOpen: state.setTerminalOpen,
      toggleTerminalOpen: state.toggleTerminalOpen,
    })),
  );
}
