"use client";

import { useSession } from "@/lib/auth-client";
import {
  Provider,
  API_KEY_REGEX,
  API_KEY_VALIDATION_ERROR
} from "@workspace/shared/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiKeyResponse {
  message: string;
  data: {
    hasApiKey: boolean;
    keyPreview?: string;
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
  };
}

export function useApiKey() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [temporaryKey, setTemporaryKey] = useState<string | null>(null);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["apiKeyStatus", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch(`${API_BASE_URL}/api-key`, {
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) {
          return await res.json() as ApiKeyResponse;
        }
        throw new Error("Failed to fetch API key status");
      }
      return (await res.json()) as ApiKeyResponse;
    },
    enabled: !!userId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async ({
      apiKey,
      method,
    }: {
      apiKey: string;
      method: "POST" | "PUT";
    }) => {
      const res = await fetch(`${API_BASE_URL}/api-key`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save API key");
      }
      return res.json() as Promise<ApiKeySaveResponse>;
    },
    onSuccess: (responseData) => {
      queryClient.setQueryData(["apiKeyStatus", userId], (old: ApiKeyResponse | undefined) => {
        if (!old) {
          return {
            message: responseData.message,
            data: {
              hasApiKey: true,
              keyPreview: responseData.data.keyPreview,
              userId: responseData.data.userId,
            }
          };
        }
        return {
          ...old,
          data: {
            ...old.data,
            hasApiKey: true,
            keyPreview: responseData.data.keyPreview,
          }
        };
      });
      queryClient.invalidateQueries({ queryKey: ["apiKeyStatus", userId] });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to save API key. Please try again.");
    },
  });

  const clearTemporaryKey = useCallback(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
    }
    setTemporaryKey(null);
  }, []);

  const validateAndSaveApiKey = async (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider = Provider.OPENAI
  ): Promise<boolean> => {
    if (!userId) {
      setError("User not authenticated");
      return false;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError(
        `Please enter your ${provider === Provider.OPENAI ? "OpenAI" : "Gemini"} API key`
      );
      return false;
    }

    if (!API_KEY_REGEX[provider].test(trimmedKey)) {
      setError(API_KEY_VALIDATION_ERROR[provider]);
      return false;
    }

    try {
      const method = data?.data?.hasApiKey ? "PUT" : "POST";
      await mutation.mutateAsync({ apiKey: trimmedKey, method });

      setTemporaryKey(trimmedKey);

      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      clearTimeoutRef.current = setTimeout(() => {
        setTemporaryKey(null);
      }, 10000);

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
    temporaryKey,
    clearTemporaryKey,
    isLoading,
    isSaving: mutation.isPending,
    userId,
  };
}