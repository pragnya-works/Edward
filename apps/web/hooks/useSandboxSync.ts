import { useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useChatStream } from "@/contexts/chatStreamContext";
import { BuildStatus, useSandbox } from "@/contexts/sandboxContext";
import type { StreamedFile } from "@/lib/chatTypes";
import { BuildRecordStatus, getBuildStatus, getSandboxFiles } from "@/lib/api";
import type { BuildErrorReport } from "@/lib/api";

const BUILD_POLL_INTERVAL_MS = 2000;
const BUILD_POLL_MAX_ATTEMPTS = 30;

export function useSandboxSync() {
  const params = useParams<{ id: string }>();
  const chatIdFromUrl = params?.id;
  const { stream } = useChatStream();
  const {
    updateFile,
    setFiles,
    startStreaming,
    stopStreaming,
    openSandbox,
    setPreviewUrl,
    setBuildStatus,
    setBuildError,
    setFullErrorReport,
    buildStatus,
  } = useSandbox();

  const prevActiveFilesRef = useRef<StreamedFile[]>([]);
  const prevCompletedFilesRef = useRef<StreamedFile[]>([]);
  const wasStreamingRef = useRef(false);
  const pollAttemptsRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedChatIdRef = useRef<string | null>(null);
  const isLoadingFilesRef = useRef(false);
  const lastPolledChatIdRef = useRef<string | null>(null);
  const isPollingInFlightRef = useRef(false);

  const loadAllSandboxFiles = useCallback(
    async (chatId: string) => {
      if (isLoadingFilesRef.current) {
        return;
      }

      isLoadingFilesRef.current = true;

      try {
        const response = await getSandboxFiles(chatId);
        const { files } = response.data;
        loadedChatIdRef.current = chatId;

        if (files && files.length > 0) {
          setFiles(files);
        }
      } catch (error) {
        console.error("Failed to load sandbox files:", error);
      } finally {
        isLoadingFilesRef.current = false;
      }
    },
    [setFiles],
  );

  const pollBuildStatus = useCallback(
    async (chatId: string) => {
      if (isPollingInFlightRef.current) {
        return;
      }

      if (pollAttemptsRef.current >= BUILD_POLL_MAX_ATTEMPTS) {
        setBuildStatus(BuildStatus.FAILED);
        setBuildError("Build timed out after multiple attempts.");
        lastPolledChatIdRef.current = null;
        return;
      }

      isPollingInFlightRef.current = true;

      try {
        const response = await getBuildStatus(chatId);
        const build = response.data.build;

        if (!build) {
          setBuildStatus(BuildStatus.BUILDING);
          setBuildError(null);
          pollAttemptsRef.current += 1;
          pollTimeoutRef.current = setTimeout(() => {
            pollBuildStatus(chatId);
          }, BUILD_POLL_INTERVAL_MS);
          return;
        }

        if (
          build.status === BuildRecordStatus.SUCCESS &&
          build.previewUrl
        ) {
          setPreviewUrl(build.previewUrl);
          openSandbox();
          setBuildError(null);
          lastPolledChatIdRef.current = null;
          return;
        }

        if (build.status === BuildRecordStatus.FAILED) {
          setBuildStatus(BuildStatus.FAILED);
          const report = build.errorReport as BuildErrorReport | null;
          const laymanReason =
            report?.rootCause?.suggestion ||
            report?.errors?.[0]?.suggestion ||
            report?.headline ||
            "An unknown error occurred during build.";

          setBuildError(String(laymanReason));
          setFullErrorReport(report);
          lastPolledChatIdRef.current = null;
          return;
        }

        if (build.status === BuildRecordStatus.QUEUED) {
          setBuildStatus(BuildStatus.QUEUED);
          setBuildError(null);
          pollAttemptsRef.current += 1;
          pollTimeoutRef.current = setTimeout(() => {
            pollBuildStatus(chatId);
          }, BUILD_POLL_INTERVAL_MS);
          return;
        }

        if (build.status === BuildRecordStatus.BUILDING) {
          setBuildStatus(BuildStatus.BUILDING);
          setBuildError(null);
          pollAttemptsRef.current += 1;
          pollTimeoutRef.current = setTimeout(() => {
            pollBuildStatus(chatId);
          }, BUILD_POLL_INTERVAL_MS);
        } else {
          setBuildStatus(BuildStatus.FAILED);
          setBuildError(`Unexpected build status: ${build.status}`);
          lastPolledChatIdRef.current = null;
        }
      } catch (error) {
        console.error("Failed to poll build status:", error);
        setBuildStatus(BuildStatus.FAILED);
        setBuildError(
          error instanceof Error
            ? error.message
            : "Failed to fetch build status",
        );
        lastPolledChatIdRef.current = null;
      } finally {
        isPollingInFlightRef.current = false;
      }
    },
    [
      setPreviewUrl,
      setBuildStatus,
      setBuildError,
      setFullErrorReport,
      openSandbox,
    ],
  );

  const prevActiveFiles = prevActiveFilesRef.current;
  const prevCompletedFiles = prevCompletedFilesRef.current;
  const activeFiles = stream.activeFiles;
  const completedFiles = stream.completedFiles;
  const isNowStreaming = activeFiles.length > 0;

  useEffect(() => {
    if (isNowStreaming && !wasStreamingRef.current) {
      const firstActiveFile = activeFiles[0];
      if (firstActiveFile) {
        startStreaming(firstActiveFile.path);
        openSandbox();
      }
    }

    if (!isNowStreaming && wasStreamingRef.current) {
      stopStreaming();
    }

    wasStreamingRef.current = isNowStreaming;

    for (const file of activeFiles) {
      const prevFile = prevActiveFiles.find((f) => f.path === file.path);
      if (!prevFile || prevFile.content !== file.content) {
        updateFile({
          path: file.path,
          content: file.content,
          isComplete: false,
        });
      }
    }

    const newCompletedFiles = completedFiles.filter((file) => {
      const prevFile = prevCompletedFiles.find((f) => f.path === file.path);
      return !prevFile || prevFile.content !== file.content;
    });

    if (
      newCompletedFiles.length > 0 ||
      (completedFiles.length > 0 &&
        completedFiles.length !== prevCompletedFiles.length)
    ) {
      const allFiles: { path: string; content: string; isComplete: boolean }[] =
        [
          ...activeFiles.map((f) => ({
            path: f.path,
            content: f.content,
            isComplete: false,
          })),
          ...completedFiles.map((f) => ({
            path: f.path,
            content: f.content,
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
    isNowStreaming,
    activeFiles,
    completedFiles,
    prevActiveFiles,
    prevCompletedFiles,
    updateFile,
    setFiles,
    startStreaming,
    stopStreaming,
    openSandbox,
  ]);

  useEffect(() => {
    const targetChatId = stream.meta?.chatId || chatIdFromUrl;

    if (
      !stream.isStreaming &&
      targetChatId &&
      (stream.completedFiles.length > 0 ||
        stream.isSandboxing ||
        stream.installingDeps.length > 0 ||
        buildStatus === BuildStatus.QUEUED ||
        buildStatus === BuildStatus.BUILDING) &&
      lastPolledChatIdRef.current !== targetChatId
    ) {
      lastPolledChatIdRef.current = targetChatId;
      pollAttemptsRef.current = 0;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      pollBuildStatus(targetChatId);
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [
    stream.isStreaming,
    stream.isSandboxing,
    stream.completedFiles.length,
    stream.installingDeps.length,
    stream.meta?.chatId,
    chatIdFromUrl,
    buildStatus,
    pollBuildStatus,
  ]);

  useEffect(() => {
    if (stream.previewUrl) {
      setPreviewUrl(stream.previewUrl);
    }
  }, [stream.previewUrl, setPreviewUrl]);

  useEffect(() => {
    if (
      chatIdFromUrl &&
      chatIdFromUrl !== loadedChatIdRef.current &&
      !stream.isStreaming &&
      lastPolledChatIdRef.current !== chatIdFromUrl
    ) {
      loadAllSandboxFiles(chatIdFromUrl);
      pollAttemptsRef.current = 0;
      lastPolledChatIdRef.current = chatIdFromUrl;
      pollBuildStatus(chatIdFromUrl);
    }
  }, [chatIdFromUrl, stream.isStreaming, loadAllSandboxFiles, pollBuildStatus]);
}
