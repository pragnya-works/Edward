import type { RefObject } from "react";

export interface AbortControllerEntry {
  controller: AbortController;
  mutationId: string;
}

interface MutationTrackingRefs {
  abortControllersRef: RefObject<Map<string, AbortControllerEntry>>;
  latestMutationByChatRef: RefObject<Map<string, string>>;
  mutationChatKeyRef: RefObject<Map<string, string>>;
}

interface RebindMutationToChatParams extends MutationTrackingRefs {
  previousChatId: string;
  nextChatId: string;
  mutationId: string;
}

interface CleanupMutationTrackingParams extends MutationTrackingRefs {
  primaryChatId: string;
  fallbackChatId: string;
  mutationId: string;
  isLatestMutationForChat: (chatId: string, mutationId: string) => boolean;
}

export function rebindMutationToChat({
  previousChatId,
  nextChatId,
  mutationId,
  abortControllersRef,
  latestMutationByChatRef,
  mutationChatKeyRef,
}: RebindMutationToChatParams): void {
  const controllerEntry = abortControllersRef.current.get(previousChatId);
  if (controllerEntry?.mutationId === mutationId) {
    abortControllersRef.current.delete(previousChatId);
    abortControllersRef.current.set(nextChatId, controllerEntry);
  }

  if (latestMutationByChatRef.current.get(previousChatId) === mutationId) {
    latestMutationByChatRef.current.delete(previousChatId);
    latestMutationByChatRef.current.set(nextChatId, mutationId);
  }

  mutationChatKeyRef.current.set(mutationId, nextChatId);
}

export function cleanupMutationTracking({
  primaryChatId,
  fallbackChatId,
  mutationId,
  abortControllersRef,
  latestMutationByChatRef,
  mutationChatKeyRef,
  isLatestMutationForChat,
}: CleanupMutationTrackingParams): void {
  for (const chatId of new Set([primaryChatId, fallbackChatId])) {
    const entry = abortControllersRef.current.get(chatId);
    if (entry?.mutationId === mutationId) {
      abortControllersRef.current.delete(chatId);
    }
    if (isLatestMutationForChat(chatId, mutationId)) {
      latestMutationByChatRef.current.delete(chatId);
    }
  }
  mutationChatKeyRef.current.delete(mutationId);
}
