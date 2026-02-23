import { create } from "zustand";
import type { StreamAction } from "@edward/shared/chat/streamActions";
import type { StreamMap } from "@/stores/chatStream/reducer";
import { streamReducer } from "@/stores/chatStream/reducer";

interface ChatStreamStoreState {
  streams: StreamMap;
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
  dispatchStreamAction: (action: StreamAction) => void;
  resetChatStreams: () => void;
}

const INITIAL_STREAMS: StreamMap = {};

export const useChatStreamStore = create<ChatStreamStoreState>((set) => ({
  streams: INITIAL_STREAMS,
  activeChatId: null,
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  dispatchStreamAction: (action) =>
    set((state) => ({
      streams: streamReducer(state.streams, action),
    })),
  resetChatStreams: () => set({ streams: INITIAL_STREAMS, activeChatId: null }),
}));

export function getChatStreamState(): ChatStreamStoreState {
  return useChatStreamStore.getState();
}
