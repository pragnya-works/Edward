import { useMemo } from "react";
import {
  INITIAL_STREAM_STATE,
  type StreamState,
} from "@edward/shared/chat/types";
import { useChatStream } from "@/contexts/chatStreamContext";
import {
  useSandbox,
} from "@/contexts/sandboxContext";
import { SandboxMode } from "@/stores/sandbox/types";
import { useBuildStatusSync } from "@/hooks/chat/useBuildStatusSync";
import { useSandboxStreamFileSync } from "@/hooks/chat/sandbox-sync/useSandboxStreamFileSync";

function resolveStreamForChat(
  streams: Record<string, StreamState>,
  chatIdFromUrl: string | undefined,
): StreamState {
  if (!chatIdFromUrl) {
    return INITIAL_STREAM_STATE;
  }

  return (
    streams[chatIdFromUrl] ??
    Object.values(streams).find(
      (candidate) =>
        candidate.streamChatId === chatIdFromUrl ||
        candidate.meta?.chatId === chatIdFromUrl,
    ) ??
    INITIAL_STREAM_STATE
  );
}

export function useSandboxSync(chatIdFromUrl: string | undefined) {
  const { streams } = useChatStream();
  const stream = useMemo(
    () => resolveStreamForChat(streams, chatIdFromUrl),
    [chatIdFromUrl, streams],
  );

  const {
    updateFile,
    setFiles,
    startStreaming,
    stopStreaming,
    clearFiles,
    openSandbox,
    closeSandbox,
    setMode,
    setPreviewUrl,
    setBuildStatus,
    setBuildError,
    setFullErrorReport,
    buildStatus,
  } = useSandbox();

  useBuildStatusSync({
    chatIdFromUrl,
    stream,
    buildStatus,
    setFiles,
    clearFiles,
    stopStreaming,
    openSandbox,
    closeSandbox,
    setMode,
    setPreviewUrl,
    setBuildStatus,
    setBuildError,
    setFullErrorReport,
  });

  useSandboxStreamFileSync({
    activeFiles: stream.activeFiles,
    completedFiles: stream.completedFiles,
    openSandbox,
    switchToCodeMode: () => setMode(SandboxMode.CODE),
    startStreaming,
    stopStreaming,
    updateFile,
    setFiles,
  });
}
