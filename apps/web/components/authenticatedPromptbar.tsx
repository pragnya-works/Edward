"use client";

import Promptbar from "@edward/ui/components/ui/promptbar";
import { useSession, signIn } from "@/lib/auth-client";
import { useApiKey } from "@/hooks/server-state/useApiKey";
import {
  useChatStreamActions,
  useChatStream,
} from "@/contexts/chatStreamContext";
import { useOptionalChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import {
  filesToMessageContent,
  type UploadedImage,
} from "@/lib/api/messageContent";
import { uploadImageToCdn } from "@/lib/api/images";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MetaEvent } from "@edward/shared/streamEvents";
import { INITIAL_STREAM_STATE } from "@edward/shared/chat/types";
import { toast } from "@edward/ui/components/sonner";
import { useChatSubmissionGuards } from "@/hooks/chat/useChatSubmissionGuards";

interface AuthenticatedPromptbarProps {
  chatId?: string;
}

export default function AuthenticatedPromptbar({
  chatId,
}: AuthenticatedPromptbarProps) {
  const workspaceContext = useOptionalChatWorkspaceContext();
  const effectiveChatId = chatId ?? workspaceContext?.chatId;
  const { data: session } = useSession();
  const {
    hasApiKey,
    isLoading,
    error,
    isRateLimited,
    rateLimitMessage,
    validateAndSaveApiKey,
    preferredModel,
    keyPreview,
  } = useApiKey();
  const router = useRouter();
  const { startStream, onMetaRef, cancelStream } = useChatStreamActions();
  const { streams } = useChatStream();
  const chatSubmissionGuards = useChatSubmissionGuards();

  const { stream, activeStreamKey } = useMemo(() => {
    if (effectiveChatId) {
      const direct = streams[effectiveChatId];
      if (direct) {
        return { stream: direct, activeStreamKey: effectiveChatId };
      }

      const matchedEntry = Object.entries(streams).find(([, candidate]) =>
        candidate.streamChatId === effectiveChatId ||
        candidate.meta?.chatId === effectiveChatId,
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
  }, [effectiveChatId, streams]);

  const handleMeta = useCallback(
    (meta: MetaEvent) => {
      if (!effectiveChatId && meta.chatId) {
        router.push(`/chat/${meta.chatId}`);
      }
    },
    [effectiveChatId, router],
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
        chatId: effectiveChatId,
        model: preferredModel || undefined,
      });
    },
    [
      startStream,
      effectiveChatId,
      preferredModel,
      stream.isStreaming,
      activeStreamKey,
      cancelStream,
    ],
  );

  const submissionDisabledReason = useMemo(() => {
    if (chatSubmissionGuards.chatRateLimitMessage) {
      return chatSubmissionGuards.chatRateLimitMessage;
    }
    if (stream.isStreaming) {
      return "A message is currently being sent. Please wait for it to finish or stop generation.";
    }
    if (chatSubmissionGuards.submissionLockMessage) {
      return chatSubmissionGuards.submissionLockMessage;
    }
    return undefined;
  }, [
    chatSubmissionGuards.chatRateLimitMessage,
    chatSubmissionGuards.submissionLockMessage,
    stream.isStreaming,
  ]);

  const shouldDisableImageUploads =
    chatSubmissionGuards.isChatRateLimited ||
    chatSubmissionGuards.isSubmissionLocked ||
    stream.isStreaming;

  const handleSignIn = useCallback(() => {
    signIn();
  }, []);

  const handleImageUploadError = useCallback((message: string) => {
    toast.error("Image upload failed", {
      id: `image-upload-failed-${message}`,
      description: message,
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (activeStreamKey) {
      cancelStream(activeStreamKey);
    }
  }, [activeStreamKey, cancelStream]);

  const promptbarController = useMemo(
    () => ({
      auth: {
        isAuthenticated: Boolean(session?.user),
        onSignIn: handleSignIn,
      },
      submission: {
        onProtectedAction: handleProtectedAction,
        hideSuggestions: Boolean(effectiveChatId),
        isStreaming: stream.isStreaming,
        onCancel: handleCancel,
        submissionDisabledReason,
      },
      attachments: {
        onImageUpload: uploadImageToCdn,
        onImageUploadError: handleImageUploadError,
        disableImageUploads: shouldDisableImageUploads,
      },
      apiKey: {
        hasApiKey,
        isApiKeyLoading: isLoading,
        apiKeyError: error,
        isApiKeyRateLimited: isRateLimited,
        apiKeyRateLimitMessage: rateLimitMessage,
        preferredModel: preferredModel || undefined,
        keyPreview,
        selectedModelId: preferredModel || undefined,
        onSaveApiKey: validateAndSaveApiKey,
      },
    }),
    [
      session?.user,
      handleSignIn,
      handleProtectedAction,
      effectiveChatId,
      stream.isStreaming,
      handleCancel,
      submissionDisabledReason,
      shouldDisableImageUploads,
      hasApiKey,
      isLoading,
      error,
      isRateLimited,
      rateLimitMessage,
      preferredModel,
      keyPreview,
      validateAndSaveApiKey,
      handleImageUploadError,
    ],
  );

  return (
    <div className="w-full">
      <Promptbar controller={promptbarController} />
    </div>
  );
}
