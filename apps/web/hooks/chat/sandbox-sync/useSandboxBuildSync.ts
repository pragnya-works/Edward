import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { StreamedFile } from "@edward/shared/chat/types";
import {
  BuildStatus,
  SandboxMode,
} from "@/stores/sandbox/types";
import {
  connectBuildEvents,
  closeBuildEvents as closeBuildEventsTransport,
} from "@/hooks/chat/sandbox-sync/buildSyncEvents";
import {
  applyBuildStatusUpdate,
} from "@/hooks/chat/sandbox-sync/buildSyncStatus";
import {
  type BuildStatusPayload,
  type UseSandboxBuildSyncParams,
} from "@/hooks/chat/sandbox-sync/buildSyncTypes";
import {
  pollBuildStatusForChat,
} from "@/hooks/chat/sandbox-sync/buildSyncPolling";
import { useSandboxDataFetchers } from "@/hooks/server-state/useSandboxData";
import { captureException } from "@sentry/nextjs";

export function useSandboxBuildSync({
  chatIdFromUrl,
  isSandboxOpen,
  stream,
  buildStatus,
  setFiles,
  clearFiles,
  stopStreaming,
  openSandbox,
  closeSandbox,
  setMode,
  setActiveFile,
  setPreviewUrl,
  setBuildStatus,
  setBuildError,
  setFullErrorReport,
}: UseSandboxBuildSyncParams): void {
  const { fetchSandboxFiles, fetchBuildStatus } = useSandboxDataFetchers(
    chatIdFromUrl,
  );
  const pollAttemptsRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedChatIdRef = useRef<string | null>(null);
  const activeRouteChatIdRef = useRef<string | null>(null);
  const routeEpochRef = useRef(0);
  const filesRequestSeqRef = useRef(0);
  const filesLoadInFlightChatIdRef = useRef<string | null>(null);
  const lastPolledChatIdRef = useRef<string | null>(null);
  const isPollingInFlightRef = useRef(false);
  const buildEventsSourceRef = useRef<EventSource | null>(null);
  const buildEventsChatIdRef = useRef<string | null>(null);
  const pushConnectedRef = useRef(false);
  const pushTerminalRef = useRef(false);
  const buildInFlightRef = useRef(false);
  const [sseErrorCount, setSseErrorCount] = useState(0);

  const isCurrentRoute = useCallback((chatId: string, epoch: number): boolean => {
    return (
      routeEpochRef.current === epoch &&
      activeRouteChatIdRef.current === chatId
    );
  }, []);

  const mergeFetchedFilesWithStreamFiles = useCallback(
    (
      fetchedFiles: Array<{ path: string; content: string; isComplete: boolean }>,
      streamFiles: {
        activeFiles: StreamedFile[];
        completedFiles: StreamedFile[];
      },
    ): Array<{ path: string; content: string; isComplete: boolean }> => {
      const byPath = new Map<
        string,
        { path: string; content: string; isComplete: boolean }
      >();

      for (const file of fetchedFiles) {
        byPath.set(file.path, file);
      }

      for (const file of streamFiles.completedFiles) {
        byPath.set(file.path, {
          path: file.path,
          content: file.content,
          isComplete: true,
        });
      }

      for (const file of streamFiles.activeFiles) {
        byPath.set(file.path, {
          path: file.path,
          content: file.content,
          isComplete: false,
        });
      }

      return Array.from(byPath.values());
    },
    [],
  );

  const loadAllSandboxFiles = useCallback(
    async (
      chatId: string,
      streamFiles: {
        activeFiles: StreamedFile[];
        completedFiles: StreamedFile[];
      },
      options?: {
        force?: boolean;
      },
    ) => {
      if (filesLoadInFlightChatIdRef.current === chatId) {
        return;
      }

      const epoch = routeEpochRef.current;
      const requestSeq = ++filesRequestSeqRef.current;
      filesLoadInFlightChatIdRef.current = chatId;

      try {
        const response = await fetchSandboxFiles({
          chatId,
          force: options?.force,
        });
        if (!response) {
          return;
        }
        const { files } = response.data;
        if (
          requestSeq === filesRequestSeqRef.current &&
          isCurrentRoute(chatId, epoch)
        ) {
          const mergedFiles = mergeFetchedFilesWithStreamFiles(
            files ?? [],
            streamFiles,
          );
          loadedChatIdRef.current = chatId;
          setFiles(mergedFiles);
        }
      } catch (error) {
        if (
          requestSeq === filesRequestSeqRef.current &&
          isCurrentRoute(chatId, epoch)
        ) {
          captureException(error);
        }
      } finally {
        if (filesLoadInFlightChatIdRef.current === chatId) {
          filesLoadInFlightChatIdRef.current = null;
        }
      }
    },
    [
      fetchSandboxFiles,
      isCurrentRoute,
      mergeFetchedFilesWithStreamFiles,
      setFiles,
    ],
  );

  const applyBuildStatus = useCallback(
    (build: BuildStatusPayload) => {
      applyBuildStatusUpdate({
        build,
        openSandbox,
        setMode,
        setPreviewUrl,
        setBuildStatus,
        setBuildError,
        setFullErrorReport,
        pushTerminalRef,
        buildInFlightRef,
        lastPolledChatIdRef,
      });
    },
    [
      openSandbox,
      setBuildError,
      setBuildStatus,
      setFullErrorReport,
      setMode,
      setPreviewUrl,
    ],
  );

  const closeBuildEvents = useCallback(() => {
    closeBuildEventsTransport({
      activeRouteChatIdRef,
      buildEventsSourceRef,
      buildEventsChatIdRef,
      pushConnectedRef,
      pushTerminalRef,
      buildInFlightRef,
      lastPolledChatIdRef,
    });
  }, []);

  useLayoutEffect(() => {
    if (!chatIdFromUrl) {
      return;
    }

    const previousChatId = activeRouteChatIdRef.current;
    if (previousChatId === chatIdFromUrl) {
      return;
    }

    activeRouteChatIdRef.current = chatIdFromUrl;
    routeEpochRef.current += 1;

    closeBuildEvents();
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    loadedChatIdRef.current = null;
    lastPolledChatIdRef.current = null;
    isPollingInFlightRef.current = false;
    pushConnectedRef.current = false;
    pushTerminalRef.current = false;
    buildInFlightRef.current = false;
    filesLoadInFlightChatIdRef.current = null;
    pollAttemptsRef.current = 0;
    setSseErrorCount(0);

    clearFiles();
    stopStreaming();
    closeSandbox();
    setPreviewUrl(null);
    setBuildStatus(BuildStatus.IDLE);
    setBuildError(null);
    setFullErrorReport(null);
    setMode(SandboxMode.CODE);
  }, [
    chatIdFromUrl,
    clearFiles,
    closeBuildEvents,
    closeSandbox,
    setBuildError,
    setBuildStatus,
    setFullErrorReport,
    setMode,
    setPreviewUrl,
    stopStreaming,
  ]);

  const connectRouteBuildEvents = useCallback(
    (chatId: string) => {
      connectBuildEvents({
        chatId,
        applyBuildStatus,
        openSandbox,
        setMode,
        setPreviewUrl,
        setBuildStatus,
        setBuildError,
        setSseErrorCount,
        activeRouteChatIdRef,
        buildEventsSourceRef,
        buildEventsChatIdRef,
        pushConnectedRef,
        pushTerminalRef,
        buildInFlightRef,
        lastPolledChatIdRef,
      });
    },
    [
      applyBuildStatus,
      openSandbox,
      setBuildError,
      setBuildStatus,
      setMode,
      setPreviewUrl,
    ],
  );

  const pollBuildStatus = useCallback(
    async (chatId: string) => {
      await pollBuildStatusForChat({
        chatId,
        epoch: routeEpochRef.current,
        isCurrentRoute,
        pollBuildStatus,
        fetchBuildStatusForChat: fetchBuildStatus,
        applyBuildStatus,
        setBuildStatus,
        setBuildError,
        setFullErrorReport,
        pollAttemptsRef,
        pollTimeoutRef,
        isPollingInFlightRef,
        pushConnectedRef,
        pushTerminalRef,
        buildInFlightRef,
      });
    },
    [
      applyBuildStatus,
      fetchBuildStatus,
      isCurrentRoute,
      setBuildError,
      setBuildStatus,
      setFullErrorReport,
    ],
  );

  const hasStreamBuildSignals =
    stream.isSandboxing ||
    stream.installingDeps.length > 0 ||
    stream.completedFiles.length > 0;
  const shouldHydrateSandboxFiles =
    isSandboxOpen ||
    hasStreamBuildSignals ||
    buildStatus === BuildStatus.QUEUED ||
    buildStatus === BuildStatus.BUILDING ||
    buildStatus === BuildStatus.FAILED ||
    buildInFlightRef.current;

  useEffect(() => {
    if (!hasStreamBuildSignals) {
      return;
    }
    buildInFlightRef.current = true;
    pushTerminalRef.current = false;
    lastPolledChatIdRef.current = null;
  }, [hasStreamBuildSignals]);

  useEffect(() => {
    const targetChatId = stream.meta?.chatId || chatIdFromUrl;
    const isBuildTerminal =
      buildStatus === BuildStatus.SUCCESS ||
      buildStatus === BuildStatus.FAILED;
    const shouldConnect =
      Boolean(targetChatId) &&
      !isBuildTerminal &&
      (hasStreamBuildSignals ||
        buildStatus === BuildStatus.QUEUED ||
        buildStatus === BuildStatus.BUILDING ||
        buildInFlightRef.current);

    if (!targetChatId || !shouldConnect) {
      closeBuildEvents();
      return;
    }

    connectRouteBuildEvents(targetChatId);
  }, [
    buildStatus,
    chatIdFromUrl,
    closeBuildEvents,
    connectRouteBuildEvents,
    hasStreamBuildSignals,
    stream.meta?.chatId,
  ]);

  useEffect(() => {
    const targetChatId = stream.meta?.chatId || chatIdFromUrl;

    if (
      !stream.isStreaming &&
      targetChatId &&
      (hasStreamBuildSignals ||
        buildStatus === BuildStatus.QUEUED ||
        buildStatus === BuildStatus.BUILDING ||
        buildInFlightRef.current) &&
      lastPolledChatIdRef.current !== targetChatId &&
      !pushTerminalRef.current &&
      (!pushConnectedRef.current || buildStatus === BuildStatus.IDLE)
    ) {
      lastPolledChatIdRef.current = targetChatId;
      pollAttemptsRef.current = 0;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      pollBuildStatus(targetChatId);
    }
  }, [
    buildStatus,
    chatIdFromUrl,
    hasStreamBuildSignals,
    pollBuildStatus,
    sseErrorCount,
    stream.isStreaming,
    stream.meta?.chatId,
  ]);

  useEffect(() => {
    if (stream.previewUrl) {
      setPreviewUrl(stream.previewUrl);
    }
  }, [setPreviewUrl, stream.previewUrl]);

  useEffect(() => {
    if (buildStatus !== BuildStatus.FAILED) {
      return;
    }

    openSandbox();
    setMode(SandboxMode.CODE);
    setActiveFile(null);
  }, [buildStatus, openSandbox, setActiveFile, setMode]);

  useEffect(() => {
    if (
      !chatIdFromUrl ||
      chatIdFromUrl === loadedChatIdRef.current ||
      !shouldHydrateSandboxFiles
    ) {
      return;
    }

    loadAllSandboxFiles(chatIdFromUrl, {
      activeFiles: stream.activeFiles,
      completedFiles: stream.completedFiles,
    }, {
      force: hasStreamBuildSignals || buildInFlightRef.current,
    });

    if (!pushConnectedRef.current && lastPolledChatIdRef.current !== chatIdFromUrl) {
      pollAttemptsRef.current = 0;
      lastPolledChatIdRef.current = chatIdFromUrl;
      pollBuildStatus(chatIdFromUrl);
    }
  }, [
    chatIdFromUrl,
    shouldHydrateSandboxFiles,
    hasStreamBuildSignals,
    loadAllSandboxFiles,
    pollBuildStatus,
    stream.activeFiles,
    stream.completedFiles,
  ]);

  useEffect(
    () => () => {
      closeBuildEvents();
      closeSandbox();
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    },
    [closeBuildEvents, closeSandbox],
  );
}
