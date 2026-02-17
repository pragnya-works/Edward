"use client";

import Promptbar from "@edward/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/useApiKey";
import {
  useChatStreamActions,
  useChatStream,
} from "@/contexts/chatStreamContext";
import { filesToMessageContent } from "@/lib/api";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MetaEvent } from "@/lib/chatTypes";
import { INITIAL_STREAM_STATE } from "@/lib/chatTypes";

interface AuthenticatedPromptbarProps {
  chatId?: string;
}

export default function AuthenticatedPromptbar({
  chatId,
}: AuthenticatedPromptbarProps) {
  const { data: session } = useSession();
  const {
    hasApiKey,
    isLoading,
    error,
    validateAndSaveApiKey,
    preferredModel,
    keyPreview,
  } = useApiKey();
  const router = useRouter();
  const { startStream, onMetaRef, cancelStream } = useChatStreamActions();
  const { streams } = useChatStream();

  const { stream, activeStreamKey } = useMemo(() => {
    if (chatId) {
      const direct = streams[chatId];
      if (direct) {
        return { stream: direct, activeStreamKey: chatId };
      }

      const matchedEntry = Object.entries(streams).find(([, candidate]) =>
        candidate.streamChatId === chatId || candidate.meta?.chatId === chatId,
      );

      if (matchedEntry) {
        return { stream: matchedEntry[1], activeStreamKey: matchedEntry[0] };
      }

      return {
        stream: INITIAL_STREAM_STATE,
        activeStreamKey: null,
      };
    }
    const pendingEntry = Object.entries(streams).find(
      ([key]) => key.startsWith("pending_"),
    );
    if (pendingEntry) {
      return { stream: pendingEntry[1], activeStreamKey: pendingEntry[0] };
    }
    return { stream: INITIAL_STREAM_STATE, activeStreamKey: null };
  }, [chatId, streams]);

  useEffect(() => {
    onMetaRef.current = (meta: MetaEvent) => {
      if (!chatId && meta.chatId) {
        router.push(`/chat/${meta.chatId}`);
      }
    };
    return () => {
      onMetaRef.current = null;
    };
  }, [chatId, onMetaRef, router]);

  const handleProtectedAction = useCallback(
    async (text: string, files?: File[]) => {
      if (stream.isStreaming && activeStreamKey) {
        cancelStream(activeStreamKey);
        return;
      }

      if (
        (!text || text.trim().length === 0) &&
        (!files || files.length === 0)
      ) {
        return;
      }

      const content = await filesToMessageContent(text, files || []);
      startStream(content, {
        chatId,
        model: preferredModel || undefined,
      });
    },
    [startStream, chatId, preferredModel, stream.isStreaming, activeStreamKey, cancelStream],
  );

  return (
    <div className="w-full">
      <Promptbar
        isAuthenticated={!!session?.user}
        onSignIn={function () {
          signIn();
        }}
        onProtectedAction={handleProtectedAction}
        hasApiKey={hasApiKey}
        isApiKeyLoading={isLoading}
        apiKeyError={error}
        preferredModel={preferredModel || undefined}
        keyPreview={keyPreview}
        selectedModelId={preferredModel || undefined}
        onSaveApiKey={validateAndSaveApiKey}
        hideSuggestions={!!chatId}
        isStreaming={stream.isStreaming}
        onCancel={() => activeStreamKey && cancelStream(activeStreamKey)}
      />
    </div>
  );
}
