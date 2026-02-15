"use client";

import Promptbar from "@edward/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/useApiKey";
import {
  useChatStreamActions,
  useChatStream,
} from "@/contexts/chatStreamContext";
import { filesToMessageContent } from "@/lib/api";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MetaEvent } from "@/lib/chatTypes";

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
  const { stream } = useChatStream();

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
      if (stream.isStreaming) {
        cancelStream();
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
    [startStream, chatId, preferredModel, stream.isStreaming, cancelStream],
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
        onCancel={cancelStream}
      />
    </div>
  );
}
