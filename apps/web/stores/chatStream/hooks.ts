import { useShallow } from "zustand/react/shallow";
import { useChatStreamStore } from "@/stores/chatStream/store";

export function useChatStreamState() {
  return useChatStreamStore(
    useShallow((state) => ({
      streams: state.streams,
      activeChatId: state.activeChatId,
    })),
  );
}

export function useChatStreamStoreActions() {
  return useChatStreamStore(
    useShallow((state) => ({
      setActiveChatId: state.setActiveChatId,
      dispatchStreamAction: state.dispatchStreamAction,
      resetChatStreams: state.resetChatStreams,
    })),
  );
}
