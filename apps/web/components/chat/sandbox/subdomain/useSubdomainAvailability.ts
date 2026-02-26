"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@edward/ui/components/sonner";
import { copyTextToClipboard } from "@edward/ui/lib/clipboard";
import { SUBDOMAIN_RESERVED } from "@edward/shared/constants";
import type { SubdomainAvailabilityResponse } from "@edward/shared/api/contracts";
import { useSubdomainMutations } from "@/hooks/server-state/useSubdomain";
import { queryKeys } from "@/lib/queryKeys";
import { ensureHttpsUrl } from "@/lib/url";

export type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; reason: string }
  | { status: "format_error"; reason: string };

interface UseSubdomainAvailabilityParams {
  open: boolean;
  chatId: string;
  currentSubdomain: string;
  suffix: string;
  onClose: () => void;
  onSaved: (newUrl: string) => void;
}

const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const AVAILABILITY_DEBOUNCE_MS = 380;

function validateSubdomainClient(value: string): string | null {
  if (!value || value.length === 0) return null;
  if (value.length < 3) return "At least 3 characters required";
  if (value.length > 63) return "63 characters max";
  if (!SUBDOMAIN_REGEX.test(value)) {
    if (value.startsWith("-") || value.endsWith("-")) {
      return "Cannot start or end with a hyphen";
    }
    return "Lowercase letters, numbers, and hyphens only";
  }
  if (SUBDOMAIN_RESERVED.has(value)) return `"${value}" is reserved`;
  return null;
}

export function useSubdomainAvailability({
  open,
  chatId,
  currentSubdomain,
  suffix,
  onClose,
  onSaved,
}: UseSubdomainAvailabilityParams) {
  const queryClient = useQueryClient();
  const { checkAvailabilityMutation, saveSubdomainMutation } = useSubdomainMutations();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef(0);

  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const value = draftValue ?? currentSubdomain;

  useEffect(() => {
    if (!open) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      return;
    }

    setDraftValue(null);
    setAvailability({ status: "idle" });
    setIsSaving(false);
    setSaveError(null);

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      activeRequestControllerRef.current?.abort();
      debounceRef.current = null;
      activeRequestControllerRef.current = null;
    };
  }, [open, currentSubdomain]);

  const runAvailabilityCheck = useCallback(
    async (subdomain: string, requestId: number, signal: AbortSignal) => {
      try {
        const queryKey = queryKeys.subdomain.availability(chatId, subdomain);
        const cachedAvailability =
          queryClient.getQueryData<SubdomainAvailabilityResponse>(queryKey);

        const response =
          cachedAvailability ??
          (await checkAvailabilityMutation.mutateAsync({
            chatId,
            subdomain,
            signal,
          }));

        if (signal.aborted || latestRequestIdRef.current !== requestId) return;
        setAvailability(
          response.data.available
            ? { status: "available" }
            : { status: "taken", reason: response.data.reason ?? "Already taken" },
        );
      } catch {
        if (signal.aborted || latestRequestIdRef.current !== requestId) return;
        setAvailability({
          status: "taken",
          reason: "Could not verify - check your connection",
        });
      }
    },
    [chatId, checkAvailabilityMutation, queryClient],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
      setDraftValue(raw);
      setSaveError(null);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      activeRequestControllerRef.current?.abort();

      if (!raw || raw === currentSubdomain) {
        setAvailability({ status: "idle" });
        return;
      }

      const formatError = validateSubdomainClient(raw);
      if (formatError) {
        setAvailability({ status: "format_error", reason: formatError });
        return;
      }

      setAvailability({ status: "checking" });
      debounceRef.current = setTimeout(() => {
        latestRequestIdRef.current += 1;
        const requestId = latestRequestIdRef.current;
        const controller = new AbortController();
        activeRequestControllerRef.current = controller;
        void runAvailabilityCheck(raw, requestId, controller.signal);
      }, AVAILABILITY_DEBOUNCE_MS);
    },
    [currentSubdomain, runAvailabilityCheck],
  );

  const canSave =
    !isSaving &&
    value.length >= 3 &&
    value !== currentSubdomain &&
    availability.status === "available";

  const saveSubdomain = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await saveSubdomainMutation.mutateAsync({
        chatId,
        subdomain: value,
      });
      const nextPreviewUrl = ensureHttpsUrl(response.data.previewUrl);
      const copied = await copyTextToClipboard(nextPreviewUrl);

      onClose();
      onSaved(nextPreviewUrl);
      toast.success("Subdomain updated", {
        description: `${response.data.subdomain}${suffix}`,
      });
      if (copied) {
        toast.success("Preview URL copied", {
          description: nextPreviewUrl,
        });
      } else {
        toast.error("Copy failed", {
          description: "Couldn't copy preview URL automatically.",
        });
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canSave, chatId, onClose, onSaved, saveSubdomainMutation, suffix, value]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void saveSubdomain();
    },
    [saveSubdomain],
  );

  const previewUrl = value
    ? `https://${value}${suffix}`
    : `https://${currentSubdomain}${suffix}`;
  const isPreviewAvailable = availability.status === "available";
  const isChecking = availability.status === "checking" || isSaving;

  const borderColor =
    availability.status === "taken"
      ? "border-destructive/50"
      : availability.status === "format_error"
        ? "border-amber-500/40"
        : availability.status === "available"
          ? "border-emerald-500/50"
          : "border-workspace-border";

  const glowColor =
    availability.status === "available"
      ? "shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
      : availability.status === "taken" || availability.status === "format_error"
        ? "shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
        : "";

  const statusMessage =
    saveError ??
    (availability.status === "taken" || availability.status === "format_error"
      ? availability.reason
      : null);

  return {
    inputRef,
    value,
    availability,
    isSaving,
    canSave,
    previewUrl,
    isPreviewAvailable,
    isChecking,
    borderColor,
    glowColor,
    statusMessage,
    saveError,
    handleChange,
    handleInputKeyDown,
    saveSubdomain,
  };
}
