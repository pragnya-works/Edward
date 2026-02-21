"use client";

import Promptbar from "@edward/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/useApiKey";
import {
  useChatStreamActions,
  useChatStream,
} from "@/contexts/chatStreamContext";
import {
  filesToMessageContent,
  uploadImageToCdn,
  type UploadedImage,
} from "@/lib/api";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MetaEvent } from "@/lib/chatTypes";
import { INITIAL_STREAM_STATE } from "@/lib/chatTypes";
import { toast } from "@edward/ui/components/sonner";

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

  const handleMeta = useCallback(
    (meta: MetaEvent) => {
      if (!chatId && meta.chatId) {
        router.push(`/chat/${meta.chatId}`);
      }
    },
    [chatId, router],
  );

  useEffect(() => {
    onMetaRef.current = handleMeta;
    return () => {
      if (onMetaRef.current === handleMeta) {
        onMetaRef.current = null;
      }
    };
  }, [handleMeta, onMetaRef]);

  const handleProtectedAction = useCallback(
    async (text: string, images?: UploadedImage[]) => {
      if (stream.isStreaming && activeStreamKey) {
        cancelStream(activeStreamKey);
        return;
      }

      const uploadedImages = (images || []).filter(
        (image) => typeof image.url === "string" && image.url.trim().length > 0,
      );

      if (
        (!text || text.trim().length === 0) &&
        uploadedImages.length === 0
      ) {
        return;
      }

      const content = await filesToMessageContent(text, uploadedImages);
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
        onImageUpload={uploadImageToCdn}
        onImageUploadError={(message) => {
          toast.error("Image upload failed", {
            id: `image-upload-failed-${message}`,
            description: message,
          });
        }}
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
