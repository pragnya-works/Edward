import { useEffect, useRef } from "react";
import type { StreamedFile } from "@edward/shared/chat/types";

interface UseSandboxStreamFileSyncParams {
  activeFiles: StreamedFile[];
  completedFiles: StreamedFile[];
  openSandbox: () => void;
  startStreaming: (filePath: string) => void;
  stopStreaming: () => void;
  updateFile: (file: { path: string; content: string; isComplete: boolean }) => void;
}

export function useSandboxStreamFileSync({
  activeFiles,
  completedFiles,
  openSandbox,
  startStreaming,
  stopStreaming,
  updateFile,
}: UseSandboxStreamFileSyncParams): void {
  const prevActiveContentsRef = useRef<Map<string, string>>(new Map());
  const prevCompletedContentsRef = useRef<Map<string, string>>(new Map());
  const wasStreamingRef = useRef(false);

  const isNowStreaming = activeFiles.length > 0;

  useEffect(() => {
    if (isNowStreaming && !wasStreamingRef.current) {
      const firstActiveFile = activeFiles[0];
      if (firstActiveFile) {
        openSandbox();
        startStreaming(firstActiveFile.path);
      }
    }

    if (!isNowStreaming && wasStreamingRef.current) {
      stopStreaming();
    }

    const prevActiveContents = prevActiveContentsRef.current;
    const nextActiveContents = new Map<string, string>();
    for (const file of activeFiles) {
      nextActiveContents.set(file.path, file.content);
      if (prevActiveContents.get(file.path) !== file.content) {
        updateFile({
          path: file.path,
          content: file.content,
          isComplete: false,
        });
      }
    }

    const prevCompletedContents = prevCompletedContentsRef.current;
    const nextCompletedContents = new Map<string, string>();
    for (const file of completedFiles) {
      nextCompletedContents.set(file.path, file.content);
      if (prevCompletedContents.get(file.path) !== file.content) {
        updateFile({
          path: file.path,
          content: file.content,
          isComplete: true,
        });
      }
    }

    prevActiveContentsRef.current = nextActiveContents;
    prevCompletedContentsRef.current = nextCompletedContents;
    wasStreamingRef.current = isNowStreaming;
  }, [
    activeFiles,
    completedFiles,
    isNowStreaming,
    openSandbox,
    startStreaming,
    stopStreaming,
    updateFile,
  ]);
}
