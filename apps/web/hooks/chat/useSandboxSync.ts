import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  INITIAL_STREAM_STATE,
  type StreamErrorState,
  type StreamState,
} from "@edward/shared/chat/types";
import type { CommandEvent } from "@edward/shared/streamEvents";
import { useChatStream } from "@/contexts/chatStreamContext";
import {
  useSandbox,
} from "@/contexts/sandboxContext";
import { BuildStatus, SandboxMode } from "@/stores/sandbox/types";
import { useBuildStatusSync } from "@/hooks/chat/useBuildStatusSync";
import { useSandboxStreamFileSync } from "@/hooks/chat/sandbox-sync/useSandboxStreamFileSync";
import { sanitizeTerminalOutput } from "@/lib/parsing/terminalOutput";

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

function buildCommandSignature(command: CommandEvent): string {
  return JSON.stringify({
    command: command.command,
    args: Array.isArray(command.args) ? command.args : [],
    exitCode: command.exitCode ?? null,
    stdout: sanitizeTerminalOutput(command.stdout) ?? "",
    stderr: sanitizeTerminalOutput(command.stderr) ?? "",
  });
}

function buildErrorSignature(error: StreamErrorState): string {
  return JSON.stringify({
    code: error.code ?? null,
    message: error.message,
    details: error.details ?? null,
  });
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
    setActiveFile,
    setPreviewUrl,
    setBuildStatus,
    setBuildError,
    setFullErrorReport,
    buildStatus,
    previewUrl,
    appendTerminalEntry,
    clearTerminalEntries,
  } = useSandbox();

  const previousRouteChatIdRef = useRef<string | undefined>(chatIdFromUrl);
  const previousStreamingRef = useRef<boolean>(false);
  const previousSandboxingRef = useRef<boolean>(false);
  const previousInstallingDepsRef = useRef<string>("");
  const previousCommandSignatureRef = useRef<string | null>(null);
  const previousErrorSignatureRef = useRef<string | null>(null);
  const previousBuildStatusRef = useRef<BuildStatus>(buildStatus);
  const previousPreviewUrlRef = useRef<string | null>(previewUrl);
  const seenTerminalEventKeysRef = useRef<Set<string>>(new Set());

  const resetTerminalTracking = useCallback(() => {
    previousCommandSignatureRef.current = null;
    previousErrorSignatureRef.current = null;
    previousSandboxingRef.current = false;
    previousInstallingDepsRef.current = "";
    seenTerminalEventKeysRef.current.clear();
  }, []);

  const appendUniqueTerminalEntry = useCallback(
    (key: string, entry: Parameters<typeof appendTerminalEntry>[0]) => {
      if (seenTerminalEventKeysRef.current.has(key)) {
        return;
      }

      seenTerminalEventKeysRef.current.add(key);
      if (seenTerminalEventKeysRef.current.size > 2_000) {
        const oldest = seenTerminalEventKeysRef.current.values().next().value;
        if (oldest) {
          seenTerminalEventKeysRef.current.delete(oldest);
        }
      }

      appendTerminalEntry(entry);
    },
    [appendTerminalEntry],
  );

  const openSandboxForRoute = useCallback(() => {
    if (chatIdFromUrl) {
      openSandbox(chatIdFromUrl);
      return;
    }
    openSandbox();
  }, [chatIdFromUrl, openSandbox]);

  useBuildStatusSync({
    chatIdFromUrl,
    stream,
    buildStatus,
    setFiles,
    clearFiles,
    stopStreaming,
    openSandbox: openSandboxForRoute,
    closeSandbox,
    setMode,
    setActiveFile,
    setPreviewUrl,
    setBuildStatus,
    setBuildError,
    setFullErrorReport,
  });

  useSandboxStreamFileSync({
    activeFiles: stream.activeFiles,
    completedFiles: stream.completedFiles,
    openSandbox: openSandboxForRoute,
    switchToCodeMode: () => setMode(SandboxMode.CODE),
    startStreaming,
    stopStreaming,
    updateFile,
  });

  useEffect(() => {
    if (previousRouteChatIdRef.current === chatIdFromUrl) {
      return;
    }

    previousRouteChatIdRef.current = chatIdFromUrl;
    resetTerminalTracking();
    previousStreamingRef.current = false;
    previousBuildStatusRef.current = buildStatus;
    previousPreviewUrlRef.current = previewUrl;
    clearTerminalEntries();
  }, [
    buildStatus,
    chatIdFromUrl,
    clearTerminalEntries,
    previewUrl,
    resetTerminalTracking,
  ]);

  useEffect(() => {
    const justStartedStreaming =
      stream.isStreaming && !previousStreamingRef.current;
    previousStreamingRef.current = stream.isStreaming;

    if (!justStartedStreaming) {
      return;
    }

    clearTerminalEntries();
    resetTerminalTracking();
    appendTerminalEntry({
      kind: "system",
      message: "Edward run started",
    });
  }, [
    appendTerminalEntry,
    clearTerminalEntries,
    resetTerminalTracking,
    stream.isStreaming,
  ]);

  useEffect(() => {
    if (stream.isSandboxing === previousSandboxingRef.current) {
      return;
    }

    if (stream.isSandboxing) {
      appendUniqueTerminalEntry("sandbox:start", {
        kind: "system",
        message: "Sandbox session opened",
      });
    } else {
      appendUniqueTerminalEntry("sandbox:end", {
        kind: "success",
        message: "Sandbox session finished",
      });
    }

    previousSandboxingRef.current = stream.isSandboxing;
  }, [appendUniqueTerminalEntry, stream.isSandboxing]);

  useEffect(() => {
    const depsKey = stream.installingDeps.join(",");
    if (depsKey === previousInstallingDepsRef.current) {
      return;
    }

    const previousDepsCount = previousInstallingDepsRef.current
      ? previousInstallingDepsRef.current.split(",").filter(Boolean).length
      : 0;
    const nextDepsCount = stream.installingDeps.length;

    if (nextDepsCount > 0) {
      appendUniqueTerminalEntry(`deps:start:${depsKey}`, {
        kind: "system",
        message: `Installing dependencies: ${depsKey}`,
      });
    } else if (previousDepsCount > 0) {
      appendUniqueTerminalEntry(`deps:end:${previousInstallingDepsRef.current}`, {
        kind: "success",
        message: "Dependency installation finished",
      });
    }

    previousInstallingDepsRef.current = depsKey;
  }, [appendUniqueTerminalEntry, stream.installingDeps]);

  useEffect(() => {
    if (!stream.command) {
      return;
    }

    const signature = buildCommandSignature(stream.command);
    if (signature === previousCommandSignatureRef.current) {
      return;
    }

    previousCommandSignatureRef.current = signature;
    appendUniqueTerminalEntry(`command:${signature}`, {
      kind: "command",
      message: "Edward command executed",
      command: stream.command.command,
      args: stream.command.args,
      exitCode: stream.command.exitCode,
      stdout: stream.command.stdout,
      stderr: stream.command.stderr,
    });
  }, [appendUniqueTerminalEntry, stream.command]);

  useEffect(() => {
    if (!stream.error) {
      return;
    }

    const signature = buildErrorSignature(stream.error);
    if (signature === previousErrorSignatureRef.current) {
      return;
    }

    previousErrorSignatureRef.current = signature;
    const isValidationWarning =
      stream.error.code === "postgen_validation" ||
      stream.error.message.startsWith("[Validation]");

    appendUniqueTerminalEntry(`error:${signature}`, {
      kind: isValidationWarning ? "warning" : "error",
      message: stream.error.message,
    });
  }, [appendUniqueTerminalEntry, stream.error]);

  useEffect(() => {
    if (buildStatus === previousBuildStatusRef.current) {
      return;
    }

    previousBuildStatusRef.current = buildStatus;
    if (buildStatus === BuildStatus.IDLE) {
      return;
    }

    const message =
      buildStatus === BuildStatus.QUEUED
        ? "Build queued"
        : buildStatus === BuildStatus.BUILDING
          ? "Build in progress"
          : buildStatus === BuildStatus.SUCCESS
            ? "Build succeeded"
            : "Build failed";

    const kind =
      buildStatus === BuildStatus.SUCCESS
        ? "success"
        : buildStatus === BuildStatus.FAILED
          ? "error"
          : "system";

    appendUniqueTerminalEntry(`build:${buildStatus}`, {
      kind,
      message,
    });
  }, [appendUniqueTerminalEntry, buildStatus]);

  useEffect(() => {
    if (previewUrl === previousPreviewUrlRef.current) {
      return;
    }

    previousPreviewUrlRef.current = previewUrl;
    if (!previewUrl) {
      return;
    }

    appendUniqueTerminalEntry(`preview:${previewUrl}`, {
      kind: "success",
      message: `Preview ready: ${previewUrl}`,
    });
  }, [appendUniqueTerminalEntry, previewUrl]);
}
