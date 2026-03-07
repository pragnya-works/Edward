import { MetaPhase, ParserEventType } from "@edward/shared/streamEvents";
import type { Dispatch } from "react";
import type { ErrorEvent, MetaEvent } from "@edward/shared/streamEvents";
import type {
  StreamState,
  StreamedFile,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
  type StreamAction,
} from "@edward/shared/chat/streamActions";
import { openRunEventsStream } from "@/lib/api/chat";
import { parseSSELines } from "@/lib/parsing/sseParser";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";
import { syncRateLimitQuotaSnapshot } from "@/lib/rateLimit/state.operations";

export interface RefCell<T> {
  current: T;
}

interface ProcessStreamResponseParams {
  response: Response;
  chatId: string;
  dispatch: Dispatch<StreamAction>;
  onMetaRef: RefCell<((meta: MetaEvent) => void) | null>;
  thinkingStartRef: RefCell<number | null>;
  onChatIdResolved?: (realChatId: string) => void;
  onCursorUpdate?: (lastEventId: string, runId: string) => void;
  replayAttempt?: number;
  replayCursor?: string;
}

interface ProcessedStreamResult {
  meta: MetaEvent | null;
  text: string;
  textOrder: number | null;
  thinking: string;
  completedFiles: StreamedFile[];
  installingDeps: string[];
  installOrder: number | null;
  installingDepsTouched: boolean;
  command: StreamState["command"];
  projectOrder: number | null;
  webSearches: StreamState["webSearches"];
  metrics: StreamState["metrics"];
  previewUrl: string | null;
  lastEventId: string | undefined;
  fatalError: NonNullable<StreamState["error"]> | null;
}

const MAX_REPLAY_ATTEMPTS = 1;

function isSameWebSearchEvent(
  a: NonNullable<StreamState["webSearches"][number]>,
  b: NonNullable<StreamState["webSearches"][number]>,
): boolean {
  return (
    a.query === b.query &&
    a.maxResults === b.maxResults &&
    a.answer === b.answer &&
    a.error === b.error &&
    JSON.stringify(a.results ?? []) === JSON.stringify(b.results ?? [])
  );
}

function hasWebSearchPayload(
  event: NonNullable<StreamState["webSearches"][number]>,
): boolean {
  return Boolean(
    event.error ||
      event.answer ||
      (event.results && event.results.length > 0),
  );
}

function mergeWebSearchEvent(
  existing: StreamState["webSearches"],
  incoming: NonNullable<StreamState["webSearches"][number]>,
): StreamState["webSearches"] {
  const last = existing[existing.length - 1];
  if (!last) {
    return [incoming];
  }

  if (isSameWebSearchEvent(last, incoming)) {
    return existing;
  }

  if (
    last.query === incoming.query &&
    !hasWebSearchPayload(last) &&
    hasWebSearchPayload(incoming)
  ) {
    return [
      ...existing.slice(0, -1),
      {
        ...incoming,
        uiOrder: last.uiOrder ?? incoming.uiOrder,
      },
    ];
  }

  if (
    last.query === incoming.query &&
    !hasWebSearchPayload(last) &&
    !hasWebSearchPayload(incoming)
  ) {
    return existing;
  }

  return [...existing, incoming];
}

function schedulePerFrame(fn: () => void): void {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    window.requestAnimationFrame(fn);
    return;
  }
  setTimeout(fn, 16);
}

function isFatalErrorEvent(event: ErrorEvent): boolean {
  return event.severity !== "recoverable";
}

function mergeFiles(
  first: StreamedFile[],
  second: StreamedFile[],
): StreamedFile[] {
  const deduped = new Map<string, StreamedFile>();
  for (const item of [...first, ...second]) {
    const existing = deduped.get(item.path);
    if (!existing || (!existing.isComplete && item.isComplete)) {
      deduped.set(item.path, item);
    }
  }
  return Array.from(deduped.values());
}

function mergeStreamResults(
  initial: ProcessedStreamResult,
  replay: ProcessedStreamResult,
): ProcessedStreamResult {
  let mergedWebSearches: StreamState["webSearches"] = [];
  for (const item of [...initial.webSearches, ...replay.webSearches]) {
    mergedWebSearches = mergeWebSearchEvent(mergedWebSearches, item);
  }

  return {
    meta: replay.meta ?? initial.meta,
    text: `${initial.text}${replay.text}`,
    textOrder:
      initial.textOrder ?? replay.textOrder ?? null,
    thinking: `${initial.thinking}${replay.thinking}`,
    completedFiles: mergeFiles(initial.completedFiles, replay.completedFiles),
    installingDeps: replay.installingDepsTouched
      ? replay.installingDeps
      : initial.installingDeps,
    installOrder:
      initial.installOrder ?? replay.installOrder ?? null,
    installingDepsTouched:
      initial.installingDepsTouched || replay.installingDepsTouched,
    command: replay.command ?? initial.command,
    projectOrder:
      initial.projectOrder ?? replay.projectOrder ?? null,
    webSearches: mergedWebSearches,
    metrics: replay.metrics ?? initial.metrics,
    previewUrl: replay.previewUrl ?? initial.previewUrl,
    lastEventId: replay.lastEventId ?? initial.lastEventId,
    fatalError: initial.fatalError ?? replay.fatalError,
  };
}

export async function processStreamResponse({
  response,
  chatId,
  dispatch,
  onMetaRef,
  thinkingStartRef,
  onChatIdResolved,
  onCursorUpdate,
  replayAttempt = 0,
  replayCursor,
}: ProcessStreamResponseParams): Promise<ProcessedStreamResult | null> {
  if (!response.body) {
    dispatch({
      type: StreamActionType.SET_ERROR,
      chatId,
      error: {
        message: "No response body from stream endpoint.",
        code: "stream_response_empty",
      },
    });
    dispatch({ type: StreamActionType.STOP_STREAMING, chatId });
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let metaEvent: MetaEvent | null = null;
  let currentFile: StreamedFile | null = null;
  let activeChatId = chatId;
  let sessionCompleted = false;
  let lastEventId = replayCursor;
  let eventOrder = 0;
  let fatalError: NonNullable<StreamState["error"]> | null = null;

  const pendingActions: StreamAction[] = [];
  let flushPromise: Promise<void> | null = null;

  const flushPendingActions = async () => {
    if (!flushPromise) {
      return;
    }
    await flushPromise;
  };

  const enqueueAction = (action: StreamAction) => {
    pendingActions.push(action);

    if (!flushPromise) {
      flushPromise = new Promise((resolve) => {
        schedulePerFrame(() => {
          const actions = pendingActions.splice(0, pendingActions.length);
          for (const pendingAction of actions) {
            dispatch(pendingAction);
          }
          flushPromise = null;
          resolve();
        });
      });
    }
  };

  const textChunks: string[] = [];
  const thinkingChunks: string[] = [];
  const TEXT_CURSOR_CHECKPOINT_INTERVAL = 50;
  let textEventsSinceLastCursorCheckpoint = 0;

  const accumulated = {
    completedFiles: [] as StreamedFile[],
    deps: [] as string[],
    installOrder: null as number | null,
    depsTouched: false,
    command: null as StreamState["command"],
    projectOrder: null as number | null,
    webSearches: [] as StreamState["webSearches"],
    metrics: null as StreamState["metrics"],
    previewUrl: null as string | null,
    textOrder: null as number | null,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const { events, remaining } = parseSSELines(sseBuffer);
    sseBuffer = remaining;

    for (const payload of events) {
      eventOrder += 1;
      if (payload.id) {
        lastEventId = payload.id;
      }

      const event = payload.event;
      switch (event.type) {
        case ParserEventType.META:
          metaEvent = event;
          if (event.chatId !== activeChatId) {
            onChatIdResolved?.(event.chatId);
            activeChatId = event.chatId;
          }
          if (event.phase === MetaPhase.SESSION_COMPLETE) {
            sessionCompleted = true;
          }
          enqueueAction({
            type: StreamActionType.SET_META,
            chatId: activeChatId,
            meta: event,
          });
          onMetaRef.current?.(event);
          if (lastEventId && event.runId) {
            onCursorUpdate?.(lastEventId, event.runId);
          }
          break;
        case ParserEventType.TEXT:
          textChunks.push(event.content);
          if (accumulated.textOrder === null) {
            accumulated.textOrder = eventOrder;
          }
          enqueueAction({
            type: StreamActionType.APPEND_TEXT,
            chatId: activeChatId,
            text: event.content,
            order: eventOrder,
          });
          textEventsSinceLastCursorCheckpoint += 1;
          if (
            textEventsSinceLastCursorCheckpoint >= TEXT_CURSOR_CHECKPOINT_INTERVAL &&
            lastEventId &&
            metaEvent?.runId
          ) {
            textEventsSinceLastCursorCheckpoint = 0;
            onCursorUpdate?.(lastEventId, metaEvent.runId);
          }
          break;
        case ParserEventType.THINKING_START:
          thinkingStartRef.current = Date.now();
          enqueueAction({
            type: StreamActionType.START_THINKING,
            chatId: activeChatId,
          });
          break;
        case ParserEventType.THINKING_CONTENT:
          thinkingChunks.push(event.content);
          enqueueAction({
            type: StreamActionType.APPEND_THINKING,
            chatId: activeChatId,
            text: event.content,
          });
          break;
        case ParserEventType.THINKING_END: {
          const duration = thinkingStartRef.current
            ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
            : null;
          thinkingStartRef.current = null;
          enqueueAction({
            type: StreamActionType.END_THINKING,
            chatId: activeChatId,
            duration,
          });
          break;
        }
        case ParserEventType.FILE_START:
          if (event.path) {
            if (accumulated.projectOrder === null) {
              accumulated.projectOrder = eventOrder;
            }
            currentFile = {
              path: event.path,
              content: "",
              isComplete: false,
            };
            enqueueAction({
              type: StreamActionType.START_FILE,
              chatId: activeChatId,
              file: { ...currentFile },
              order: eventOrder,
            });
          }
          break;
        case ParserEventType.FILE_CONTENT:
          if (currentFile) {
            currentFile.content += event.content;
            enqueueAction({
              type: StreamActionType.APPEND_FILE_CONTENT,
              chatId: activeChatId,
              path: currentFile.path,
              content: event.content,
            });
          }
          break;
        case ParserEventType.FILE_END:
          if (currentFile) {
            currentFile.isComplete = true;
            accumulated.completedFiles.push({ ...currentFile });
            enqueueAction({
              type: StreamActionType.COMPLETE_FILE,
              chatId: activeChatId,
              path: currentFile.path,
            });
            currentFile = null;
          }
          break;
        case ParserEventType.INSTALL_CONTENT:
          accumulated.deps = event.dependencies;
          if (accumulated.installOrder === null) {
            accumulated.installOrder = eventOrder;
          }
          accumulated.depsTouched = true;
          enqueueAction({
            type: StreamActionType.SET_INSTALLING_DEPS,
            chatId: activeChatId,
            deps: event.dependencies,
            order: eventOrder,
          });
          break;
        case ParserEventType.INSTALL_END:
          accumulated.deps = [];
          accumulated.depsTouched = true;
          enqueueAction({
            type: StreamActionType.SET_INSTALLING_DEPS,
            chatId: activeChatId,
            deps: [],
            order: eventOrder,
          });
          break;
        case ParserEventType.SANDBOX_START:
          enqueueAction({
            type: StreamActionType.SET_SANDBOXING,
            chatId: activeChatId,
            isSandboxing: true,
          });
          break;
        case ParserEventType.SANDBOX_END:
          enqueueAction({
            type: StreamActionType.SET_SANDBOXING,
            chatId: activeChatId,
            isSandboxing: false,
          });
          break;
        case ParserEventType.COMMAND:
          accumulated.command = event;
          if (accumulated.projectOrder === null) {
            accumulated.projectOrder = eventOrder;
          }
          enqueueAction({
            type: StreamActionType.SET_COMMAND,
            chatId: activeChatId,
            command: event,
            order: eventOrder,
          });
          break;
        case ParserEventType.WEB_SEARCH:
          accumulated.webSearches = mergeWebSearchEvent(
            accumulated.webSearches,
            {
              ...event,
              uiOrder: eventOrder,
            },
          );
          enqueueAction({
            type: StreamActionType.SET_WEB_SEARCH,
            chatId: activeChatId,
            webSearch: event,
            order: eventOrder,
          });
          break;
        case ParserEventType.URL_SCRAPE:
          enqueueAction({
            type: StreamActionType.SET_URL_SCRAPE,
            chatId: activeChatId,
            urlScrape: event,
            order: eventOrder,
          });
          break;
        case ParserEventType.ERROR: {
          if (!isFatalErrorEvent(event)) {
            break;
          }
          const streamError: NonNullable<StreamState["error"]> = {
            message: event.message,
            code: event.code,
            details: event.details,
            severity: event.severity,
          };
          enqueueAction({
            type: StreamActionType.SET_ERROR,
            chatId: activeChatId,
            error: streamError,
          });
          fatalError ??= streamError;
          break;
        }
        case ParserEventType.METRICS:
          accumulated.metrics = event;
          enqueueAction({
            type: StreamActionType.SET_METRICS,
            chatId: activeChatId,
            metrics: accumulated.metrics,
          });
          break;
        case ParserEventType.RATE_LIMIT_STATUS:
          if (
            event.scope === RATE_LIMIT_SCOPE.CHAT_DAILY &&
            Number.isFinite(event.limit) &&
            Number.isFinite(event.remaining) &&
            Number.isFinite(event.resetAtMs)
          ) {
            syncRateLimitQuotaSnapshot(RATE_LIMIT_SCOPE.CHAT_DAILY, {
              limit: Math.trunc(event.limit),
              remaining: Math.trunc(event.remaining),
              resetAt: new Date(Math.trunc(event.resetAtMs)),
              isLimited: Math.trunc(event.remaining) <= 0,
            });
          }
          break;
        case ParserEventType.PREVIEW_URL:
          accumulated.previewUrl = event.url;
          enqueueAction({
            type: StreamActionType.SET_PREVIEW_URL,
            chatId: activeChatId,
            url: event.url,
          });
          break;
        case ParserEventType.BUILD_STATUS:
        case ParserEventType.DONE:
          break;
      }
    }

    await flushPendingActions();
  }

  await flushPendingActions();

  const result: ProcessedStreamResult = {
    meta: metaEvent,
    text: textChunks.join(""),
    textOrder: accumulated.textOrder,
    thinking: thinkingChunks.join(""),
    completedFiles: accumulated.completedFiles,
    installingDeps: accumulated.deps,
    installOrder: accumulated.installOrder,
    installingDepsTouched: accumulated.depsTouched,
    command: accumulated.command,
    projectOrder: accumulated.projectOrder,
    webSearches: accumulated.webSearches,
    metrics: accumulated.metrics,
    previewUrl: accumulated.previewUrl,
    lastEventId,
    fatalError,
  };

  if (
    !fatalError &&
    !sessionCompleted &&
    replayAttempt < MAX_REPLAY_ATTEMPTS &&
    metaEvent?.runId
  ) {
    try {
      const replayResponse = await openRunEventsStream(
        activeChatId,
        metaEvent.runId,
        lastEventId ? { lastEventId } : undefined,
      );
      const replayResult = await processStreamResponse({
        response: replayResponse,
        chatId: activeChatId,
        dispatch,
        onMetaRef,
        thinkingStartRef,
        onChatIdResolved,
        onCursorUpdate,
        replayAttempt: replayAttempt + 1,
        replayCursor: lastEventId,
      });

      if (replayResult) {
        return mergeStreamResults(result, replayResult);
      }
    } catch {
      const replayError: NonNullable<StreamState["error"]> = {
        message:
          "Stream disconnected before completion and replay failed. Please retry.",
        code: "stream_replay_failed",
        severity: "fatal",
      };
      enqueueAction({
        type: StreamActionType.SET_ERROR,
        chatId: activeChatId,
        error: replayError,
      });
      await flushPendingActions();
      result.fatalError ??= replayError;
    }
  }

  return result;
}
