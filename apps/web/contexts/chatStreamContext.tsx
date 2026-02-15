"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, type MessageContent } from "@/lib/api";
import {
  ParserEventType,
  INITIAL_STREAM_STATE,
  type StreamState,
  type MetaEvent,
  type StreamedFile,
} from "@/lib/chatTypes";
import { parseSSELines } from "@/lib/sseParser";

interface ChatStreamStateContextValue {
  stream: StreamState;
  activeChatId: string | null;
}

interface ChatStreamActionsContextValue {
  startStream: (
    content: MessageContent,
    opts?: { chatId?: string; model?: string },
  ) => void;
  cancelStream: () => void;
  resetStream: () => void;
  setActiveChatId: (id: string | null) => void;
  onMetaRef: React.MutableRefObject<((meta: MetaEvent) => void) | null>;
}

const ChatStreamStateContext =
  createContext<ChatStreamStateContextValue | null>(null);
const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const [streamState, setStreamState] =
    useState<StreamState>(INITIAL_STREAM_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const onMetaRef = useRef<((meta: MetaEvent) => void) | null>(null);
  const thinkingStartRef = useRef<number | null>(null);

  const resetStream = useCallback(() => {
    setStreamState(INITIAL_STREAM_STATE);
    thinkingStartRef.current = null;
  }, []);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreamState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  const processStream = useCallback(
    async (response: Response): Promise<MetaEvent | null> => {
      if (!response.body) {
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          error: "No response body",
        }));
        return null;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let metaEvent: MetaEvent | null = null;

      let accText = "";
      let accThinking = "";
      let currentFile: StreamedFile | null = null;
      const completedFiles: StreamedFile[] = [];
      let deps: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSELines(sseBuffer);
        sseBuffer = remaining;

        for (const event of events) {
          switch (event.type) {
            case ParserEventType.META:
              metaEvent = event;
              setStreamState((prev) => ({ ...prev, meta: event }));
              onMetaRef.current?.(event);
              break;

            case ParserEventType.TEXT:
              accText += event.content;
              setStreamState((prev) => ({
                ...prev,
                streamingText: accText,
              }));
              break;

            case ParserEventType.THINKING_START:
              thinkingStartRef.current = Date.now();
              setStreamState((prev) => ({
                ...prev,
                isThinking: true,
                thinkingDuration: null,
              }));
              break;

            case ParserEventType.THINKING_CONTENT:
              accThinking += event.content;
              setStreamState((prev) => ({
                ...prev,
                thinkingText: accThinking,
              }));
              break;

            case ParserEventType.THINKING_END: {
              const dur = thinkingStartRef.current
                ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
                : null;
              thinkingStartRef.current = null;
              setStreamState((prev) => ({
                ...prev,
                isThinking: false,
                thinkingDuration: dur,
              }));
              break;
            }

            case ParserEventType.FILE_START:
              currentFile = {
                path: event.path,
                content: "",
                isComplete: false,
              };
              setStreamState((prev) => ({
                ...prev,
                activeFiles: [...prev.activeFiles, currentFile!],
              }));
              break;

            case ParserEventType.FILE_CONTENT:
              if (currentFile) {
                currentFile.content += event.content;
                setStreamState((prev) => ({
                  ...prev,
                  activeFiles: prev.activeFiles.map((f) =>
                    f.path === currentFile!.path
                      ? { ...f, content: currentFile!.content }
                      : f,
                  ),
                }));
              }
              break;

            case ParserEventType.FILE_END:
              if (currentFile) {
                currentFile.isComplete = true;
                completedFiles.push({ ...currentFile });
                setStreamState((prev) => ({
                  ...prev,
                  activeFiles: prev.activeFiles.filter(
                    (f) => f.path !== currentFile!.path,
                  ),
                  completedFiles: [...completedFiles],
                }));
                currentFile = null;
              }
              break;

            case ParserEventType.INSTALL_CONTENT:
              deps = event.dependencies;
              setStreamState((prev) => ({
                ...prev,
                installingDeps: deps,
              }));
              break;

            case ParserEventType.SANDBOX_START:
              setStreamState((prev) => ({ ...prev, isSandboxing: true }));
              break;

            case ParserEventType.SANDBOX_END:
              setStreamState((prev) => ({ ...prev, isSandboxing: false }));
              break;

            case ParserEventType.COMMAND:
              setStreamState((prev) => ({ ...prev, command: event }));
              break;

            case ParserEventType.ERROR:
              setStreamState((prev) => ({
                ...prev,
                error: event.message,
              }));
              break;

            case ParserEventType.METRICS:
              setStreamState((prev) => ({
                ...prev,
                metrics: {
                  completionTime: event.completionTime,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                },
              }));
              break;

            default:
              break;
          }
        }
      }

      return metaEvent;
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: async ({
      content,
      chatId,
      model,
    }: {
      content: MessageContent;
      chatId?: string;
      model?: string;
    }) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreamState({ ...INITIAL_STREAM_STATE, isStreaming: true });
      thinkingStartRef.current = null;

      const body: Record<string, unknown> = { content };
      if (chatId) body.chatId = chatId;
      if (model) body.model = model;

      const response = await fetch(`${API_BASE_URL}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Request failed: ${response.status}`,
        );
      }

      const metaEvt = await processStream(response);

      if (metaEvt?.chatId) {
        queryClient.invalidateQueries({
          queryKey: ["chatHistory", metaEvt.chatId],
        });
        queryClient.invalidateQueries({ queryKey: ["recentChats"] });
      }

      return metaEvt;
    },
    onSuccess: () => {
      setStreamState((prev) => ({ ...prev, isStreaming: false }));
    },
    onError: (err: Error) => {
      if (err.name === "AbortError") {
        setStreamState((prev) => ({ ...prev, isStreaming: false }));
        return;
      }
      setStreamState((prev) => ({
        ...prev,
        isStreaming: false,
        error: err.message,
      }));
    },
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const startStream = useCallback(
    (content: MessageContent, opts?: { chatId?: string; model?: string }) => {
      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
      });
    },
    [mutation],
  );

  const actions = useMemo(
    () => ({
      startStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      onMetaRef,
    }),
    [startStream, cancelStream, resetStream, setActiveChatId, onMetaRef],
  );

  return (
    <ChatStreamStateContext.Provider
      value={{ stream: streamState, activeChatId }}
    >
      <ChatStreamActionsContext.Provider value={actions}>
        {children}
      </ChatStreamActionsContext.Provider>
    </ChatStreamStateContext.Provider>
  );
}

export function useChatStream() {
  const ctx = useContext(ChatStreamStateContext);
  if (!ctx) {
    throw new Error("useChatStream must be used within a ChatStreamProvider");
  }
  return ctx;
}

export function useChatStreamActions() {
  const ctx = useContext(ChatStreamActionsContext);
  if (!ctx) {
    throw new Error(
      "useChatStreamActions must be used within a ChatStreamProvider",
    );
  }
  return ctx;
}

export function useChatStreamContext() {
  const state = useChatStream();
  const actions = useChatStreamActions();
  return { ...state, ...actions };
}
