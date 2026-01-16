"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "@/lib/auth-client";
import { encryptApiKey } from "@workspace/ui/lib/encryption";
import { Provider, API_KEY_REGEX } from "@workspace/ui/constants/apiKey.constants";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const axiosInstance = axios.create({ baseURL: API_BASE_URL });

export function useApiKey() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [error, setError] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasApiKey(null);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    async function getApiKeyStatus() {
      setLoading(true);
      try {
        const { data } = await axiosInstance.get("/api-key", {
          signal: controller.signal,
          withCredentials: true,
        });

        if (isMounted) {
          setHasApiKey(data?.data?.hasApiKey ?? false);
        }
      } catch {
        if (isMounted) {
          setHasApiKey(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    getApiKeyStatus();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [userId]);

  async function validateAndSaveApiKey(
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider = Provider.OPENAI
  ): Promise<boolean> {
    if (!userId) {
      setError("User not authenticated");
      return false;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError(
        `Please enter your ${
          provider === Provider.OPENAI ? "OpenAI" : "Gemini"
        } API key`
      );
      return false;
    }

    if (!API_KEY_REGEX[provider].test(trimmedKey)) {
      setError(
        provider === Provider.OPENAI
          ? "Invalid OpenAI API key format"
          : "Invalid Gemini API key format"
      );
      return false;
    }

    try {
      const encryptedKey = await encryptApiKey(trimmedKey);

      await axiosInstance.post(
        "/api-key",
        { apiKey: encryptedKey },
        {
          headers: { "X-User-Id": userId },
          withCredentials: true,
        }
      );

      setError("");
      setHasApiKey(true);
      onValidate(trimmedKey);
      onClose();
      return true;
    } catch {
      setError("Failed to save API key. Please try again.");
      return false;
    }
  }

  return {
    error,
    validateAndSaveApiKey,
    hasApiKey,
    isLoading: loading,
    userId,
  };
}
