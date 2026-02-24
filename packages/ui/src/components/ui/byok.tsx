"use client";

import { useEffect, useReducer, type KeyboardEvent } from "react";
import {
  Provider,
  API_KEY_VALIDATION_ERROR,
} from "@edward/shared/constants";
import { getDefaultModel, getModelSpecByProvider } from "@edward/shared/schema";
import type { BYOKProps } from "./byok/byok.types";
import { BYOKFooter } from "./byok/byokFooter";
import { BYOKHeader } from "./byok/byokHeader";
import { BYOKProviderTabs } from "./byok/byokProviderTabs";
import { byokReducer, createInitialState } from "./byok/byok.state";
import {
  getProviderFromKeyPreview,
  PROVIDERS_CONFIG,
  resolveByokProps,
  validateApiKey,
} from "./byok/byok.utils";
import {
  Dialog,
  DialogContent,
} from "@edward/ui/components/dialog";

export function BYOK(props: BYOKProps) {
  const {
    isOpen,
    onClose,
    onValidate,
    onSaveApiKey,
    externalError,
    initialApiKey,
    initialProvider,
    keyPreview,
    hasExistingKey,
    preferredModel,
    onModelChange,
    isRateLimited,
    rateLimitMessage,
  } = resolveByokProps(props);

  const [state, dispatch] = useReducer(
    byokReducer,
    createInitialState(initialApiKey, initialProvider, preferredModel),
  );

  const {
    apiKey,
    selectedProvider,
    selectedModel,
    localError,
    isSubmitting,
    showPassword,
    showSuccess,
  } = state;

  const isApiKeyActionDisabled = isSubmitting || isRateLimited;

  useEffect(() => {
    if (!isOpen) return;
    dispatch({
      type: "reset",
      payload: createInitialState(initialApiKey, initialProvider, preferredModel),
    });
  }, [isOpen, initialApiKey, initialProvider, preferredModel]);

  const trimmedApiKey = apiKey.trim();
  const existingKeyProvider = getProviderFromKeyPreview(keyPreview);
  const isExistingKeyCompatible =
    keyPreview === "Existing Key" ||
    !existingKeyProvider ||
    existingKeyProvider === selectedProvider;

  const selectedModelForProvider =
    selectedModel &&
    getModelSpecByProvider(selectedProvider, selectedModel) !== null
      ? selectedModel
      : undefined;
  const preferredModelForProvider =
    preferredModel &&
    getModelSpecByProvider(selectedProvider, preferredModel) !== null
      ? preferredModel
      : undefined;

  const isApiKeyValid =
    !trimmedApiKey || validateApiKey(trimmedApiKey, selectedProvider);
  const isModelChanged =
    !!selectedModelForProvider && selectedModelForProvider !== preferredModel;

  const providerLabel =
    PROVIDERS_CONFIG.find((provider) => provider.id === selectedProvider)?.label ??
    selectedProvider;
  const providerMismatchError =
    hasExistingKey && !trimmedApiKey && !isExistingKeyCompatible
      ? `The active key might not be compatible with ${providerLabel}. Please provide a new key.`
      : "";

  const error =
    rateLimitMessage ||
    externalError ||
    providerMismatchError ||
    (!isApiKeyValid ? API_KEY_VALIDATION_ERROR[selectedProvider] : localError);

  const canSubmit =
    !isApiKeyActionDisabled &&
    isApiKeyValid &&
    !providerMismatchError &&
    (trimmedApiKey ? true : hasExistingKey && isModelChanged);
  const modelToPersist =
    selectedModelForProvider ||
    preferredModelForProvider ||
    getDefaultModel(selectedProvider);
  const isModelOnlyUpdate = !trimmedApiKey && hasExistingKey && isModelChanged;

  function handleModelChange(modelId: string) {
    dispatch({ type: "set-model", payload: modelId });
    dispatch({ type: "set-local-error", payload: "" });
    onModelChange?.(modelId);
  }

  async function handleSubmit() {
    if (!canSubmit || !onSaveApiKey || isRateLimited) return;

    dispatch({ type: "set-submitting", payload: true });
    dispatch({ type: "set-local-error", payload: "" });

    try {
      const success = await onSaveApiKey(
        trimmedApiKey,
        onValidate,
        onClose,
        selectedProvider,
        modelToPersist,
      );
      if (success) {
        dispatch({ type: "set-show-success", payload: true });
      }
    } catch {
      dispatch({
        type: "set-local-error",
        payload: "Failed to save API key. Please try again.",
      });
    } finally {
      dispatch({ type: "set-submitting", payload: false });
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isRateLimited) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function handleTabChange(value: string) {
    dispatch({ type: "set-provider", payload: value as Provider });
    dispatch({ type: "set-local-error", payload: "" });
  }

  function togglePasswordVisibility() {
    dispatch({ type: "toggle-password-visibility" });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[440px] w-[95vw] p-0 overflow-hidden border-border/40 dark:border-white/[0.1] gap-0 max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl dark:shadow-black/60 dark:bg-[oklch(0.185_0_0)]">
        <BYOKHeader
          hasExistingKey={hasExistingKey}
          keyPreview={keyPreview}
          existingKeyProvider={existingKeyProvider}
        />

        <BYOKProviderTabs
          selectedProvider={selectedProvider}
          isApiKeyActionDisabled={isApiKeyActionDisabled}
          apiKey={apiKey}
          showPassword={showPassword}
          error={error}
          selectedModel={selectedModel}
          onTabChange={handleTabChange}
          onApiKeyChange={(nextApiKey) =>
            dispatch({ type: "set-api-key", payload: nextApiKey })
          }
          onTogglePassword={togglePasswordVisibility}
          onKeyDown={handleKeyDown}
          onModelChange={handleModelChange}
        />

        <BYOKFooter
          showSuccess={showSuccess}
          onClose={onClose}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          onSubmit={() => void handleSubmit()}
          isModelOnlyUpdate={isModelOnlyUpdate}
        />
      </DialogContent>
    </Dialog>
  );
}
