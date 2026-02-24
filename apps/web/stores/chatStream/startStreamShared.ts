import type { RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { MetaEvent } from "@edward/shared/streamEvents";
import type {
  ChatMessage,
  StreamState,
} from "@edward/shared/chat/types";
import type {
  StreamAction,
} from "@edward/shared/chat/streamActions";
import type {
  MessageContent,
} from "@/lib/api/messageContent";
import type {
  RefCell,
} from "@/lib/streaming/processors/chatStreamProcessor";
import type {
  AbortControllerEntry,
} from "@/stores/chatStream/mutationTracking";

export interface RemovedAssistantSnapshot {
  message: ChatMessage;
  index: number;
}

export interface StartStreamMutationVariables {
  content: MessageContent;
  chatId?: string;
  model?: string;
  retryTargetUserMessageId?: string;
  retryTargetAssistantMessageId?: string;
  submissionLockToken?: string;
  streamKey: string;
  mutationId: string;
  controller: AbortController;
  optimisticUserMessageId?: string;
  retryInsertIndex?: number;
  removedAssistantSnapshot?: RemovedAssistantSnapshot;
}

export interface StartStreamOptions {
  chatId?: string;
  model?: string;
  suppressOptimisticUserMessage?: boolean;
  retryTargetUserMessageId?: string;
  retryTargetAssistantMessageId?: string;
}

export interface StartStreamMutationDeps {
  dispatch: (action: StreamAction) => void;
  onMetaRef: RefCell<((meta: MetaEvent) => void) | null>;
  queryClient: QueryClient;
  streamsRef: RefObject<Record<string, StreamState>>;
  abortControllersRef: RefObject<Map<string, AbortControllerEntry>>;
  latestMutationByChatRef: RefObject<Map<string, string>>;
  mutationChatKeyRef: RefObject<Map<string, string>>;
  isLatestMutationForChat: (chatId: string, mutationId: string) => boolean;
  persistCursor: (chatId: string, runId: string, lastEventId: string) => void;
  clearCursor: (chatId: string, runId: string) => void;
}

export interface StartStreamPreparedState {
  optimisticUserMessageId?: string;
  retryInsertIndex?: number;
  removedAssistantSnapshot?: RemovedAssistantSnapshot;
}

export const ABORT_ERROR_NAME = "AbortError";
export const PENDING_CHAT_ID_PREFIX = "pending_";
export const OPTIMISTIC_USER_MESSAGE_PREFIX = "optimistic_user_";
