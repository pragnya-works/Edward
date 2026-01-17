"use client";

import { useSession } from "@/lib/auth-client";
import { 
  Provider, 
  API_KEY_REGEX, 
  API_KEY_VALIDATION_ERROR 
} from "@workspace/ui/constants/apiKey.constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiKeyResponse {
  message: string;
  data: {
    hasApiKey: boolean;
    apiKey?: string;
    userId: string;
  };
}

export function useApiKey() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["apiKey", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch(`${API_BASE_URL}/api-key`, {
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch API key");
      }
      return (await res.json()) as ApiKeyResponse;
    },
    enabled: !!userId,
    retry: false,
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
        throw new Error("Failed to save API key");
      }
      return res.json();
    },
    onSuccess: (responseData, variables) => {
      queryClient.setQueryData(["apiKey", userId], (old: ApiKeyResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            hasApiKey: true,
            apiKey: variables.apiKey,
          }
        };
      });
      queryClient.invalidateQueries({ queryKey: ["apiKey", userId] });
    },
    onError: () => {
      setError("Failed to save API key. Please try again.");
    },
  });

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
    apiKey: data?.data?.apiKey || null,
    isLoading,
    userId,
  };
}