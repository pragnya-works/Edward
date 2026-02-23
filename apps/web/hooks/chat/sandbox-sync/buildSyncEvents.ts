import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import {
  ParserEventType,
} from "@edward/shared/stream-events";
import {
  BuildStatus,
  SandboxMode,
} from "@/contexts/sandboxContext";
import {
  BuildRecordStatus,
  type BuildErrorReport,
} from "@/lib/api/build";
import {
  buildApiUrl,
} from "@/lib/api/httpClient";
import type {
  BuildStatusPayload,
} from "@/hooks/chat/sandbox-sync/buildSyncTypes";

interface BuildEventPayload {
  type: ParserEventType;
  status?: BuildRecordStatus;
  previewUrl?: string | null;
  errorReport?: BuildErrorReport | null;
  url?: string;
}

interface BuildEventRefs {
  activeRouteChatIdRef: RefObject<string | null>;
  buildEventsSourceRef: RefObject<EventSource | null>;
  buildEventsChatIdRef: RefObject<string | null>;
  pushConnectedRef: RefObject<boolean>;
  pushTerminalRef: RefObject<boolean>;
  buildInFlightRef: RefObject<boolean>;
  lastPolledChatIdRef: RefObject<string | null>;
}

interface ConnectBuildEventsParams extends BuildEventRefs {
  chatId: string;
  applyBuildStatus: (build: BuildStatusPayload) => void;
  openSandbox: () => void;
  setMode: (mode: SandboxMode) => void;
  setPreviewUrl: (url: string | null) => void;
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setSseErrorCount: Dispatch<SetStateAction<number>>;
}

function isActiveBuildChat(chatId: string, refs: BuildEventRefs): boolean {
  return (
    refs.buildEventsChatIdRef.current === chatId &&
    refs.activeRouteChatIdRef.current === chatId
  );
}

export function closeBuildEvents(refs: BuildEventRefs): void {
  refs.pushConnectedRef.current = false;
  if (refs.buildEventsSourceRef.current) {
    refs.buildEventsSourceRef.current.close();
    refs.buildEventsSourceRef.current = null;
  }
  refs.buildEventsChatIdRef.current = null;
}

export function connectBuildEvents({
  chatId,
  applyBuildStatus,
  openSandbox,
  setMode,
  setPreviewUrl,
  setBuildStatus,
  setBuildError,
  setSseErrorCount,
  ...refs
}: ConnectBuildEventsParams): void {
  if (
    refs.buildEventsSourceRef.current &&
    refs.buildEventsChatIdRef.current === chatId
  ) {
    return;
  }

  closeBuildEvents(refs);
  refs.pushTerminalRef.current = false;

  const source = new EventSource(buildApiUrl(`/chat/${chatId}/build-events`), {
    withCredentials: true,
  });

  refs.buildEventsSourceRef.current = source;
  refs.buildEventsChatIdRef.current = chatId;

  source.onopen = () => {
    refs.pushConnectedRef.current = true;
  };

  source.onmessage = (event) => {
    if (!isActiveBuildChat(chatId, refs)) {
      return;
    }

    if (!event.data || event.data === "[DONE]") {
      return;
    }

    try {
      const parsed = JSON.parse(event.data) as BuildEventPayload;

      if (parsed.type === ParserEventType.BUILD_STATUS && parsed.status) {
        applyBuildStatus({
          status: parsed.status,
          previewUrl: parsed.previewUrl,
          errorReport: parsed.errorReport,
        });

        if (
          parsed.status === BuildRecordStatus.SUCCESS ||
          parsed.status === BuildRecordStatus.FAILED
        ) {
          refs.pushTerminalRef.current = true;
          closeBuildEvents(refs);
          return;
        }
      }

      if (parsed.type === ParserEventType.PREVIEW_URL && parsed.url) {
        setPreviewUrl(parsed.url);
        if (refs.buildInFlightRef.current) {
          openSandbox();
          setMode(SandboxMode.PREVIEW);
          setBuildStatus(BuildStatus.SUCCESS);
          setBuildError(null);
          refs.pushTerminalRef.current = true;
          refs.buildInFlightRef.current = false;
        }
      }
    } catch {
      // Ignore malformed SSE frames.
    }
  };

  source.onerror = () => {
    if (!isActiveBuildChat(chatId, refs)) {
      return;
    }

    if (refs.pushTerminalRef.current) {
      closeBuildEvents(refs);
      return;
    }

    refs.pushConnectedRef.current = false;
    refs.lastPolledChatIdRef.current = null;
    closeBuildEvents(refs);
    setSseErrorCount((count) => count + 1);
  };
}
