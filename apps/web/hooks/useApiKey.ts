"use client";

import { useSession } from "@/lib/auth-client";
import {
  Provider,
  API_KEY_REGEX,
  API_KEY_VALIDATION_ERROR,
} from "@edward/shared/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fetchApi } from "@/lib/api";

interface ApiKeyResponse {
  message: string;
  data: {
    hasApiKey: boolean;
    keyPreview?: string;
    preferredModel?: string;
    userId: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface ApiKeySaveResponse {
  message: string;
  data: {
    userId: string;
    keyPreview: string;
    preferredModel?: string;
  };
}

export function useApiKey() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["apiKey", userId],
    queryFn: async function () {
      if (!userId) return null;
      try {
        return await fetchApi<ApiKeyResponse>("/api-key");
      } catch (err) {
        const errorWithStatus = err as { status?: number } | null;
        if (
          errorWithStatus &&
          typeof errorWithStatus === "object" &&
          "status" in errorWithStatus &&
          errorWithStatus.status === 404
        ) {
          return {
            message: "Not found",
            data: { hasApiKey: false, userId },
          } as ApiKeyResponse;
        }
        throw err;
      }
    },
    enabled: !!userId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async function ({
      apiKey,
      model,
      method,
    }: {
      apiKey: string;
      model?: string;
      method: "POST" | "PUT";
    }) {
      return fetchApi<ApiKeySaveResponse>("/api-key", {
        method,
        body: JSON.stringify({ apiKey, model }),
      });
    },
    onSuccess: function (responseData) {
      queryClient.setQueryData(
        ["apiKey", userId],
        function (old: ApiKeyResponse | undefined) {
          if (!old) return old;
          return {
            ...old,
            data: {
              ...old.data,
              hasApiKey: true,
              keyPreview: responseData.data.keyPreview,
              preferredModel: responseData.data.preferredModel,
            },
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["apiKey", userId] });
    },
    onError: function () {
      setError("Failed to save API key. Please try again.");
    },
  });

  const validateAndSaveApiKey = async (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider = Provider.OPENAI,
    model?: string,
  ): Promise<boolean> => {
    if (!userId) {
      setError("User not authenticated");
      return false;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError(
        `Please enter your ${provider === Provider.OPENAI ? "OpenAI" : "Gemini"} API key`,
      );
      return false;
    }

    if (!API_KEY_REGEX[provider].test(trimmedKey)) {
      setError(API_KEY_VALIDATION_ERROR[provider]);
      return false;
    }

    try {
      const method = data?.data?.hasApiKey ? "PUT" : "POST";
      await mutation.mutateAsync({ apiKey: trimmedKey, model, method });

      setError("");
      onValidate(trimmedKey);
      onClose();
      return true;
    } catch {
      return false;
    }
  };

  return {
    error: error || (mutation.error ? "Failed to save API key" : ""),
    validateAndSaveApiKey,
    hasApiKey: data?.data?.hasApiKey ?? null,
    keyPreview: data?.data?.keyPreview || null,
    preferredModel: data?.data?.preferredModel || null,
    isLoading,
    isSaving: mutation.isPending,
    userId,
  };
}
