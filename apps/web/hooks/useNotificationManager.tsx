"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { ParserEventType } from "@edward/shared/streamEvents";
import { toast } from "@edward/ui/components/sonner";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { buildApiUrl } from "@/lib/api/httpClient";
import { useSession } from "@/lib/auth-client";
import { useNotificationsStore } from "@/stores/notifications/store";
import { useSandboxStore } from "@/stores/sandbox/store";

const TERMINAL_STATUSES = new Set<BuildRecordStatus>([
  BuildRecordStatus.SUCCESS,
  BuildRecordStatus.FAILED,
]);

const RECONNECT_AFTER_TERMINAL_MS = 12_000;
const RECONNECT_AFTER_ERROR_MS = 4_000;

interface BuildEventPayload {
  type?: string;
  status?: BuildRecordStatus;
  buildId?: string;
}

interface ParsedBuildEvent {
  status: BuildRecordStatus;
  buildId: string | null;
}

function resolveChatIdFromPathname(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }

  const match = pathname.match(/^\/chat\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function notifyBrowser(chatId: string, chatTitle: string, status: BuildRecordStatus): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }

  const title =
    status === BuildRecordStatus.SUCCESS ? "Build complete" : "Build failed";
  const body =
    status === BuildRecordStatus.SUCCESS
      ? `${chatTitle} is ready.`
      : `${chatTitle} needs attention.`;
  const notification = new Notification(title, {
    body,
    tag: `build-status:${chatId}`,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = `/chat/${encodeURIComponent(chatId)}`;
    notification.close();
  };
}

function EdwardToastIcon() {
  return <EdwardLogo size={30} className="rounded-lg" />;
}

function parseBuildEvent(data: string): ParsedBuildEvent | null {
  let payload: BuildEventPayload;
  try {
    payload = JSON.parse(data) as BuildEventPayload;
  } catch {
    return null;
  }

  if (payload.type !== ParserEventType.BUILD_STATUS || !payload.status) {
    return null;
  }

  return {
    status: payload.status,
    buildId: typeof payload.buildId === "string" ? payload.buildId : null,
  };
}

export function useNotificationManager() {
  const { data: session, isPending: isSessionPending } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const pathname = usePathname();
  const routeChatId = useMemo(
    () => resolveChatIdFromPathname(pathname),
    [pathname],
  );
  const storeRouteChatId = useSandboxStore((s) => s.routeChatId);
  const activeChatId = storeRouteChatId ?? routeChatId;

  const subscriptions = useNotificationsStore((s) => s.subscriptions);
  const hasHydrated = useNotificationsStore((s) => s.hasHydrated);
  const setBrowserPermission = useNotificationsStore((s) => s.setBrowserPermission);

  const activeChatIdRef = useRef<string | null>(activeChatId);
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());
  const initialFrameSeenRef = useRef<Map<string, boolean>>(new Map());
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const scheduleReconnectRef = useRef<(chatId: string, delayMs: number) => void>(
    () => {},
  );
  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      return;
    }
    setBrowserPermission(Notification.permission);
  }, [setBrowserPermission]);

  const clearReconnect = useCallback((chatId: string) => {
    const timeoutId = reconnectTimersRef.current.get(chatId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      reconnectTimersRef.current.delete(chatId);
    }
  }, []);

  const closeSource = useCallback((chatId: string) => {
    const source = sourcesRef.current.get(chatId);
    if (source) {
      source.close();
      sourcesRef.current.delete(chatId);
    }
    initialFrameSeenRef.current.delete(chatId);
  }, []);

  const showToast = useCallback(
    (chatId: string, chatTitle: string, status: BuildRecordStatus, buildId: string | null) => {
      const toastId = `build:${chatId}:${buildId ?? "latest"}:${status}`;
      const title =
        status === BuildRecordStatus.SUCCESS ? "Build complete" : "Build failed";
      const description =
        status === BuildRecordStatus.SUCCESS
          ? `${chatTitle} is ready`
          : `${chatTitle} ended with an error`;

      toast(title, {
        id: toastId,
        duration: 12_000,
        className: "ed-toast--build",
        description,
        icon: <EdwardToastIcon />,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = `/chat/${encodeURIComponent(chatId)}`;
          },
        },
      });
    },
    [],
  );

  const handleBuildStatusEvent = useCallback(
    (chatId: string, event: ParsedBuildEvent) => {
      const { status, buildId } = event;
      const state = useNotificationsStore.getState();
      const previous = state.getBuildCheckpoint(chatId);
      const isDuplicate = previous?.status === status && previous.buildId === buildId;
      const isTerminal = TERMINAL_STATUSES.has(status);

      state.setBuildCheckpoint(chatId, {
        buildId,
        status,
        updatedAt: Date.now(),
      });

      const seenInitial = initialFrameSeenRef.current.get(chatId) ?? false;
      if (!seenInitial) {
        initialFrameSeenRef.current.set(chatId, true);
      }

      if (isDuplicate) {
        if (isTerminal && activeChatIdRef.current !== chatId) {
          closeSource(chatId);
          scheduleReconnectRef.current(chatId, RECONNECT_AFTER_TERMINAL_MS);
        }
        return;
      }

      if (!isTerminal || activeChatIdRef.current === chatId) {
        return;
      }

      const isFirstSnapshot = !seenInitial && (!previous || previous.status === status);
      if (isFirstSnapshot) {
        closeSource(chatId);
        scheduleReconnectRef.current(chatId, RECONNECT_AFTER_TERMINAL_MS);
        return;
      }

      const subscription = state.getSubscription(chatId);
      const chatTitle = subscription?.chatTitle ?? "Untitled app";
      showToast(chatId, chatTitle, status, buildId);
      notifyBrowser(chatId, chatTitle, status);

      closeSource(chatId);
      scheduleReconnectRef.current(chatId, RECONNECT_AFTER_TERMINAL_MS);
    },
    [closeSource, showToast],
  );

  const attachSourceListeners = useCallback(
    (chatId: string, source: EventSource) => {
      source.addEventListener("message", (event) => {
        if (typeof event.data !== "string" || !event.data || event.data === "[DONE]") {
          return;
        }
        const parsedEvent = parseBuildEvent(event.data);
        if (!parsedEvent) {
          return;
        }
        handleBuildStatusEvent(chatId, parsedEvent);
      });

      source.addEventListener("error", () => {
        if (source.readyState !== EventSource.CLOSED) {
          return;
        }
        closeSource(chatId);
        scheduleReconnectRef.current(chatId, RECONNECT_AFTER_ERROR_MS);
      });
    },
    [closeSource, handleBuildStatusEvent],
  );

  const openSource = useCallback(
    (chatId: string) => {
      if (!isAuthenticatedRef.current) {
        return;
      }

      clearReconnect(chatId);

      const existingSource = sourcesRef.current.get(chatId);
      if (existingSource) {
        if (existingSource.readyState !== EventSource.CLOSED) {
          return;
        }
        existingSource.close();
        sourcesRef.current.delete(chatId);
      }

      const url = buildApiUrl(`/chat/${encodeURIComponent(chatId)}/build-events`);
      const source = new EventSource(url, { withCredentials: true });
      initialFrameSeenRef.current.set(chatId, false);
      sourcesRef.current.set(chatId, source);
      attachSourceListeners(chatId, source);
    },
    [attachSourceListeners, clearReconnect],
  );

  const scheduleReconnect = useCallback(
    (chatId: string, delayMs: number) => {
      if (reconnectTimersRef.current.has(chatId)) {
        return;
      }

      const timeoutId = setTimeout(() => {
        reconnectTimersRef.current.delete(chatId);
        const state = useNotificationsStore.getState();
        if (!isAuthenticatedRef.current) {
          return;
        }
        if (!state.isSubscribed(chatId)) {
          return;
        }
        if (activeChatIdRef.current === chatId) {
          return;
        }

        openSource(chatId);
      }, delayMs);

      reconnectTimersRef.current.set(chatId, timeoutId);
    },
    [openSource],
  );

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!isAuthenticated || isSessionPending) {
      for (const source of sourcesRef.current.values()) {
        source.close();
      }
      sourcesRef.current.clear();
      initialFrameSeenRef.current.clear();

      for (const timeoutId of reconnectTimersRef.current.values()) {
        clearTimeout(timeoutId);
      }
      reconnectTimersRef.current.clear();
      return;
    }

    const subscribedChatIds = Object.keys(subscriptions);

    for (const chatId of Array.from(sourcesRef.current.keys())) {
      if (subscriptions[chatId] && chatId !== activeChatId) {
        continue;
      }
      closeSource(chatId);
      clearReconnect(chatId);
    }

    for (const chatId of Array.from(reconnectTimersRef.current.keys())) {
      if (subscriptions[chatId] && chatId !== activeChatId) {
        continue;
      }
      clearReconnect(chatId);
    }

    for (const chatId of subscribedChatIds) {
      if (chatId === activeChatId) {
        continue;
      }
      openSource(chatId);
    }
  }, [
    activeChatId,
    clearReconnect,
    closeSource,
    hasHydrated,
    isAuthenticated,
    isSessionPending,
    openSource,
    subscriptions,
  ]);

  useEffect(
    () => () => {
      for (const source of sourcesRef.current.values()) {
        source.close();
      }
      sourcesRef.current.clear();
      initialFrameSeenRef.current.clear();

      for (const timeoutId of reconnectTimersRef.current.values()) {
        clearTimeout(timeoutId);
      }
      reconnectTimersRef.current.clear();
    },
    [],
  );
}
