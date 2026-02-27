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
import { enhancePrompt } from "@/lib/api/chat";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MetaEvent } from "@edward/shared/streamEvents";
import { INITIAL_STREAM_STATE } from "@edward/shared/chat/types";
import { toast } from "@edward/ui/components/sonner";
import { useChatSubmissionGuards } from "@/hooks/chat/useChatSubmissionGuards";
import { useImageUpload } from "@/hooks/server-state/useImageUpload";
import { getBestGuessProvider } from "@edward/shared/schema";
import { PromptTablets } from "@/components/promptTablets";
import type { PromptbarRef } from "@edward/ui/components/ui/promptbar/promptbar.constants";

interface AuthenticatedPromptbarProps {
  chatId?: string;
  onTopContextVisibilityChange?: (visible: boolean) => void;
}

export default function AuthenticatedPromptbar({
  chatId,
  onTopContextVisibilityChange,
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
  const {
    uploadImage,
    isRateLimited: isImageUploadRateLimited,
    rateLimitMessage: imageUploadRateLimitMessage,
  } = useImageUpload();
  const shouldAutoNavigateToNewChatRef = useRef(false);

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
      if (
        !effectiveChatId &&
        meta.chatId &&
        shouldAutoNavigateToNewChatRef.current
      ) {
        shouldAutoNavigateToNewChatRef.current = false;
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
        shouldAutoNavigateToNewChatRef.current = false;
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

      shouldAutoNavigateToNewChatRef.current = !effectiveChatId;
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
    stream.isStreaming ||
    isImageUploadRateLimited;

  const imageUploadDisabledReason = useMemo(() => {
    if (imageUploadRateLimitMessage) {
      return imageUploadRateLimitMessage;
    }
    if (stream.isStreaming) {
      return "Stop generation before attaching new images.";
    }
    if (chatSubmissionGuards.submissionLockMessage) {
      return chatSubmissionGuards.submissionLockMessage;
    }
    if (chatSubmissionGuards.chatRateLimitMessage) {
      return chatSubmissionGuards.chatRateLimitMessage;
    }
    return null;
  }, [
    imageUploadRateLimitMessage,
    stream.isStreaming,
    chatSubmissionGuards.submissionLockMessage,
    chatSubmissionGuards.chatRateLimitMessage,
  ]);

  const handleSignIn = useCallback(() => {
    signIn();
  }, []);

  const handleImageUploadError = useCallback((message: string) => {
    const normalizedMessage =
      message.trim() || "Image upload failed. Please try again.";
    const isRateLimitError =
      /too many requests|rate limit|temporarily limited|upload limit|429/i.test(
        normalizedMessage,
      );

    toast.error(isRateLimitError ? "Image uploads limited" : "Image upload failed", {
      id: `image-upload-failed-${normalizedMessage}`,
      description: normalizedMessage,
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (activeStreamKey) {
      shouldAutoNavigateToNewChatRef.current = false;
      cancelStream(activeStreamKey);
    }
  }, [activeStreamKey, cancelStream]);

  const enhancementProvider = useMemo(
    () => getBestGuessProvider(preferredModel ?? null, keyPreview ?? null),
    [keyPreview, preferredModel],
  );

  const handleEnhancePrompt = useCallback(
    async (text: string) => {
      try {
        const response = await enhancePrompt(text, enhancementProvider);
        const enhanced = response.data.enhancedPrompt?.trim();
        if (!enhanced) {
          return text;
        }
        return enhanced;
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "Unable to enhance prompt.";
        toast.error("Prompt enhancement failed", { description });
        return text;
      }
    },
    [enhancementProvider],
  );

  const promptbarRef = useRef<PromptbarRef>(null);

  const handleSelectPrompt = useCallback((prompt: string) => {
    promptbarRef.current?.prefill(prompt);
  }, []);

  const promptbarController = useMemo(
    () => ({
      auth: {
        isAuthenticated: Boolean(session?.user),
        onSignIn: handleSignIn,
      },
      submission: {
        onProtectedAction: handleProtectedAction,
        onEnhancePrompt: handleEnhancePrompt,
        onTopContextVisibilityChange,
        hideSuggestions: Boolean(effectiveChatId),
        isStreaming: stream.isStreaming,
        onCancel: handleCancel,
        submissionDisabledReason,
      },
      attachments: {
        onImageUpload: uploadImage,
        onImageUploadError: handleImageUploadError,
        disableImageUploads: shouldDisableImageUploads,
        imageUploadDisabledReason: imageUploadDisabledReason || undefined,
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
      handleEnhancePrompt,
      onTopContextVisibilityChange,
      effectiveChatId,
      stream.isStreaming,
      handleCancel,
      submissionDisabledReason,
      shouldDisableImageUploads,
      imageUploadDisabledReason,
      uploadImage,
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

  const showTablets = Boolean(session?.user) && !effectiveChatId && !stream.isStreaming;

  return (
    <div className="w-full">
      <Promptbar ref={promptbarRef} controller={promptbarController} />
      {showTablets && (
        <div className="mt-3 flex justify-center">
          <PromptTablets onSelectPrompt={handleSelectPrompt} />
        </div>
      )}
    </div>
  );
}
