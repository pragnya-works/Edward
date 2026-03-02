import type {
  RefObject,
} from "react";
import {
  BuildRecordStatus,
  type BuildStatusResponse,
  type BuildErrorReport,
} from "@edward/shared/api/contracts";
import { BuildStatus } from "@/stores/sandbox/types";
import {
  BUILD_POLL_INTERVAL_MS,
  BUILD_POLL_MAX_ATTEMPTS,
  type BuildStatusPayload,
} from "@/hooks/chat/sandbox-sync/buildSyncTypes";
import { captureException } from "@sentry/nextjs";

interface PollBuildStatusForChatParams {
  chatId: string;
  epoch: number;
  isCurrentRoute: (chatId: string, epoch: number) => boolean;
  pollBuildStatus: (chatId: string) => Promise<void>;
  fetchBuildStatusForChat: (options?: {
    force?: boolean;
    chatId?: string;
  }) => Promise<BuildStatusResponse | null>;
  applyBuildStatus: (build: BuildStatusPayload) => void;
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setFullErrorReport: (report: BuildErrorReport | null) => void;
  pollAttemptsRef: RefObject<number>;
  pollTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  isPollingInFlightRef: RefObject<boolean>;
  pushConnectedRef: RefObject<boolean>;
  pushTerminalRef: RefObject<boolean>;
  buildInFlightRef: RefObject<boolean>;
  buildExpectedFromMsRef: RefObject<number | null>;
}

export async function pollBuildStatusForChat({
  chatId,
  epoch,
  isCurrentRoute,
  pollBuildStatus,
  fetchBuildStatusForChat,
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
  buildExpectedFromMsRef,
}: PollBuildStatusForChatParams): Promise<void> {
  const scheduleNextPoll = () => {
    if (!isCurrentRoute(chatId, epoch)) {
      return;
    }
    if (pushConnectedRef.current) {
      return;
    }
    pollAttemptsRef.current += 1;
    pollTimeoutRef.current = setTimeout(() => {
      void pollBuildStatus(chatId);
    }, BUILD_POLL_INTERVAL_MS);
  };

  if (!isCurrentRoute(chatId, epoch)) {
    return;
  }

  if (isPollingInFlightRef.current) {
    return;
  }

  if (pollAttemptsRef.current >= BUILD_POLL_MAX_ATTEMPTS) {
    if (!isCurrentRoute(chatId, epoch)) {
      return;
    }
    setBuildStatus(BuildStatus.FAILED);
    setBuildError("Build timed out after multiple attempts.");
    pushTerminalRef.current = true;
    buildInFlightRef.current = false;
    return;
  }

  isPollingInFlightRef.current = true;

  try {
    const response = await fetchBuildStatusForChat({
      chatId,
      force: true,
    });
    if (!response) {
      return;
    }
    if (!isCurrentRoute(chatId, epoch)) {
      return;
    }
    const build = response.data.build;

    if (!build) {
      if (buildInFlightRef.current) {
        scheduleNextPoll();
        return;
      }
      setBuildStatus(BuildStatus.IDLE);
      setBuildError(null);
      setFullErrorReport(null);
      pushTerminalRef.current = true;
      buildInFlightRef.current = false;
      return;
    }

    const buildCreatedAtMs = Date.parse(build.createdAt);
    const buildExpectedFromMs = buildExpectedFromMsRef.current;
    const isBuildTerminal =
      build.status === BuildRecordStatus.SUCCESS ||
      build.status === BuildRecordStatus.FAILED;
    const isStaleTerminalWhileAwaitingNewBuild =
      isBuildTerminal &&
      buildInFlightRef.current &&
      typeof buildExpectedFromMs === "number" &&
      Number.isFinite(buildCreatedAtMs) &&
      buildCreatedAtMs + 1_000 < buildExpectedFromMs;

    if (isStaleTerminalWhileAwaitingNewBuild) {
      scheduleNextPoll();
      return;
    }

    applyBuildStatus({
      status: build.status,
      previewUrl: build.previewUrl,
      errorReport: build.errorReport,
    });

    if (
      !build.status ||
      build.status === BuildRecordStatus.QUEUED ||
      build.status === BuildRecordStatus.BUILDING
    ) {
      scheduleNextPoll();
    }
  } catch (error) {
    if (!isCurrentRoute(chatId, epoch)) {
      return;
    }
    captureException(error);
    setBuildStatus(BuildStatus.FAILED);
    setBuildError(
      error instanceof Error
        ? error.message
        : "Failed to fetch build status",
    );
    pushTerminalRef.current = true;
    buildInFlightRef.current = false;
  } finally {
    if (isCurrentRoute(chatId, epoch)) {
      isPollingInFlightRef.current = false;
    }
  }
}
