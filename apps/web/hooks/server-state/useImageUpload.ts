"use client";

import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type { UploadedImage } from "@/lib/api/messageContent";
import { uploadImageToCdn } from "@/lib/api/images";
import { useRateLimitScope } from "@/hooks/rateLimit/useRateLimitScope";
import {
  formatRateLimitResetTime,
  RATE_LIMIT_SCOPE,
} from "@/lib/rateLimit/scopes";

interface UploadApiError extends Error {
  status?: number;
}

export function useImageUpload() {
  const imageUploadRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.IMAGE_UPLOAD_BURST);

  const imageUploadRateLimitMessage = useMemo(() => {
    if (!imageUploadRateLimit.isActive) {
      return null;
    }

    if (imageUploadRateLimit.resetAt) {
      return `Image uploads are temporarily limited. Try again at ${formatRateLimitResetTime(imageUploadRateLimit.resetAt)}.`;
    }

    return "Image uploads are temporarily limited. Please try again shortly.";
  }, [imageUploadRateLimit.isActive, imageUploadRateLimit.resetAt]);

  const uploadMutation = useMutation<UploadedImage, Error, File>({
    mutationFn: async (file) => {
      if (imageUploadRateLimit.isActive) {
        const rateLimitedError = new Error(
          imageUploadRateLimitMessage ||
            "Image uploads are temporarily limited. Please try again shortly.",
        ) as UploadApiError;
        rateLimitedError.status = 429;
        throw rateLimitedError;
      }

      return uploadImageToCdn(file);
    },
    retry: false,
  });

  return {
    uploadImage: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    isRateLimited: imageUploadRateLimit.isActive,
    rateLimitMessage: imageUploadRateLimitMessage,
  };
}
