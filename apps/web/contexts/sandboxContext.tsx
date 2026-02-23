"use client";

import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useSandboxStore,
} from "@/stores/sandbox/store";
import {
  BuildStatus as StoreBuildStatus,
  SandboxMode as StoreSandboxMode,
} from "@/stores/sandbox/types";

export type BuildStatus = StoreBuildStatus;
export const BuildStatus = StoreBuildStatus;
export type SandboxMode = StoreSandboxMode;
export const SandboxMode = StoreSandboxMode;

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
  const toggleSearch = useSandboxStore((state) => state.toggleSearch);

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
    })),
  );
}
