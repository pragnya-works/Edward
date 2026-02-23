import { useEffect, useRef } from "react";
import type { StreamedFile } from "@edward/shared/chat/types";

interface UseSandboxStreamFileSyncParams {
  activeFiles: StreamedFile[];
  completedFiles: StreamedFile[];
  openSandbox: () => void;
  switchToCodeMode: () => void;
  startStreaming: (filePath: string) => void;
  stopStreaming: () => void;
  updateFile: (file: { path: string; content: string; isComplete: boolean }) => void;
  setFiles: (files: { path: string; content: string; isComplete: boolean }[]) => void;
}

export function useSandboxStreamFileSync({
  activeFiles,
  completedFiles,
  openSandbox,
  switchToCodeMode,
  startStreaming,
  stopStreaming,
  updateFile,
  setFiles,
}: UseSandboxStreamFileSyncParams): void {
  const prevActiveFilesRef = useRef<StreamedFile[]>([]);
  const prevCompletedFilesRef = useRef<StreamedFile[]>([]);
  const wasStreamingRef = useRef(false);

  const isNowStreaming = activeFiles.length > 0;

  useEffect(() => {
    if (isNowStreaming && !wasStreamingRef.current) {
      const firstActiveFile = activeFiles[0];
      if (firstActiveFile) {
        openSandbox();
        switchToCodeMode();
        startStreaming(firstActiveFile.path);
      }
    }

    if (!isNowStreaming && wasStreamingRef.current) {
      stopStreaming();
    }

    wasStreamingRef.current = isNowStreaming;

    const prevActiveFiles = prevActiveFilesRef.current;
    const prevCompletedFiles = prevCompletedFilesRef.current;

    for (const file of activeFiles) {
      const prevFile = prevActiveFiles.find((candidate) => candidate.path === file.path);
      if (!prevFile || prevFile.content !== file.content) {
        updateFile({
          path: file.path,
          content: file.content,
          isComplete: false,
        });
      }
    }

    const newCompletedFiles = completedFiles.filter((file) => {
      const prevFile = prevCompletedFiles.find((candidate) => candidate.path === file.path);
      return !prevFile || prevFile.content !== file.content;
    });

    if (
      newCompletedFiles.length > 0 ||
      (completedFiles.length > 0 &&
        completedFiles.length !== prevCompletedFiles.length)
    ) {
      const allFiles: { path: string; content: string; isComplete: boolean }[] = [
        ...activeFiles.map((file) => ({
          path: file.path,
          content: file.content,
          isComplete: false,
        })),
        ...completedFiles.map((file) => ({
          path: file.path,
          content: file.content,
          isComplete: true,
        })),
      ];

      const uniqueFiles = new Map<
        string,
        { path: string; content: string; isComplete: boolean }
      >();

      for (const file of allFiles) {
        const existing = uniqueFiles.get(file.path);
        if (!existing || (!existing.isComplete && file.isComplete)) {
          uniqueFiles.set(file.path, file);
        }
      }

      setFiles(Array.from(uniqueFiles.values()));
    }

    prevActiveFilesRef.current = activeFiles;
    prevCompletedFilesRef.current = completedFiles;
  }, [
    activeFiles,
    completedFiles,
    isNowStreaming,
    openSandbox,
    switchToCodeMode,
    setFiles,
    startStreaming,
    stopStreaming,
    updateFile,
  ]);
}
