import { MetaPhase, ParserEventType } from "@edward/shared/stream-events";
import type { Dispatch } from "react";
import {
  type MetaEvent,
  type StreamState,
  type StreamedFile,
} from "@/lib/chatTypes";
import { openRunEventsStream } from "@/lib/api";
import { parseSSELines } from "@/lib/sseParser";
import { StreamActionType, type StreamAction } from "./chatStream.reducer";

const MAX_REPLAY_ATTEMPTS = 1;

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
  replayAttempt?: number;
  replayCursor?: string;
}

interface ProcessedStreamResult {
  meta: MetaEvent | null;
  text: string;
  thinking: string;
  completedFiles: StreamedFile[];
  installingDeps: string[];
  installingDepsTouched: boolean;
  command: StreamState["command"];
  webSearches: StreamState["webSearches"];
  metrics: StreamState["metrics"];
  previewUrl: string | null;
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
  return {
    meta: replay.meta ?? initial.meta,
    text: `${initial.text}${replay.text}`,
    thinking: `${initial.thinking}${replay.thinking}`,
    completedFiles: mergeFiles(initial.completedFiles, replay.completedFiles),
    installingDeps: replay.installingDepsTouched
      ? replay.installingDeps
      : initial.installingDeps,
    installingDepsTouched:
      initial.installingDepsTouched || replay.installingDepsTouched,
    command: replay.command ?? initial.command,
    webSearches: [...initial.webSearches, ...replay.webSearches],
    metrics: replay.metrics ?? initial.metrics,
    previewUrl: replay.previewUrl ?? initial.previewUrl,
  };
}

export async function processStreamResponse({
  response,
  chatId,
  dispatch,
  onMetaRef,
  thinkingStartRef,
  onChatIdResolved,
  replayAttempt = 0,
  replayCursor,
}: ProcessStreamResponseParams): Promise<ProcessedStreamResult | null> {
  if (!response.body) {
    dispatch({
      type: StreamActionType.SET_ERROR,
      chatId,
      error: "No response body",
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

  const accumulated = {
    completedFiles: [] as StreamedFile[],
    deps: [] as string[],
    depsTouched: false,
    command: null as StreamState["command"],
    webSearches: [] as StreamState["webSearches"],
    metrics: null as StreamState["metrics"],
    previewUrl: null as string | null,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const { events, remaining } = parseSSELines(sseBuffer);
    sseBuffer = remaining;

    for (const payload of events) {
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
          break;
        case ParserEventType.TEXT:
          textChunks.push(event.content);
          enqueueAction({
            type: StreamActionType.APPEND_TEXT,
            chatId: activeChatId,
            text: event.content,
          });
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
            currentFile = {
              path: event.path,
              content: "",
              isComplete: false,
            };
            enqueueAction({
              type: StreamActionType.START_FILE,
              chatId: activeChatId,
              file: { ...currentFile },
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
          accumulated.depsTouched = true;
          enqueueAction({
            type: StreamActionType.SET_INSTALLING_DEPS,
            chatId: activeChatId,
            deps: event.dependencies,
          });
          break;
        case ParserEventType.INSTALL_END:
          accumulated.deps = [];
          accumulated.depsTouched = true;
          enqueueAction({
            type: StreamActionType.SET_INSTALLING_DEPS,
            chatId: activeChatId,
            deps: [],
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
          enqueueAction({
            type: StreamActionType.SET_COMMAND,
            chatId: activeChatId,
            command: event,
          });
          break;
        case ParserEventType.WEB_SEARCH:
          if (
            accumulated.webSearches.length === 0 ||
            JSON.stringify(
              accumulated.webSearches[accumulated.webSearches.length - 1],
            ) !== JSON.stringify(event)
          ) {
            accumulated.webSearches.push(event);
          }
          enqueueAction({
            type: StreamActionType.SET_WEB_SEARCH,
            chatId: activeChatId,
            webSearch: event,
          });
          break;
        case ParserEventType.URL_SCRAPE:
          enqueueAction({
            type: StreamActionType.SET_URL_SCRAPE,
            chatId: activeChatId,
            urlScrape: event,
          });
          break;
        case ParserEventType.ERROR:
          enqueueAction({
            type: StreamActionType.SET_ERROR,
            chatId: activeChatId,
            error: event.message,
          });
          break;
        case ParserEventType.METRICS:
          accumulated.metrics = event;
          enqueueAction({
            type: StreamActionType.SET_METRICS,
            chatId: activeChatId,
            metrics: accumulated.metrics,
          });
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
    thinking: thinkingChunks.join(""),
    completedFiles: accumulated.completedFiles,
    installingDeps: accumulated.deps,
    installingDepsTouched: accumulated.depsTouched,
    command: accumulated.command,
    webSearches: accumulated.webSearches,
    metrics: accumulated.metrics,
    previewUrl: accumulated.previewUrl,
  };

  if (
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
        replayAttempt: replayAttempt + 1,
        replayCursor: lastEventId,
      });

      if (replayResult) {
        return mergeStreamResults(result, replayResult);
      }
    } catch {
      enqueueAction({
        type: StreamActionType.SET_ERROR,
        chatId: activeChatId,
        error:
          "Stream disconnected before completion and replay failed. Please retry.",
      });
      await flushPendingActions();
    }
  }

  return result;
}
