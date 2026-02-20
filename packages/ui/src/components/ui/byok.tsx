"use client";

import { useEffect, useReducer, type KeyboardEvent } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@edward/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@edward/ui/components/tabs";
import { OpenAI } from "@edward/ui/components/ui/openAi";
import { Gemini } from "@edward/ui/components/ui/gemini";
import {
  Provider,
  API_KEY_REGEX,
  API_KEY_VALIDATION_ERROR,
} from "@edward/shared/constants";
import { getDefaultModel, getModelSpecByProvider } from "@edward/shared/schema";
import { ApiKeyInput } from "@edward/ui/components/ui/apiKeyInput";
import { ModelSelector } from "@edward/ui/components/ui/modelSelector";

interface BYOKProps {
  isOpen?: boolean;
  onClose: () => void;
  onValidate: (key: string) => void;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  error?: string;
  initialApiKey?: string;
  initialProvider?: Provider;
  preferredModel?: string;
  keyPreview?: string | null;
  hasExistingKey?: boolean;
  onModelChange?: (modelId: string) => void;
}

interface BYOKState {
  apiKey: string;
  selectedProvider: Provider;
  selectedModel?: string;
  localError: string;
  isSubmitting: boolean;
  showPassword: boolean;
  showSuccess: boolean;
}

type BYOKAction =
  | { type: "set-api-key"; payload: string }
  | { type: "set-provider"; payload: Provider }
  | { type: "set-model"; payload?: string }
  | { type: "set-local-error"; payload: string }
  | { type: "set-submitting"; payload: boolean }
  | { type: "toggle-password-visibility" }
  | { type: "set-show-success"; payload: boolean }
  | { type: "reset"; payload: BYOKState };

const PROVIDERS_CONFIG = [
  {
    id: Provider.OPENAI,
    label: "OpenAI",
    icon: OpenAI,
    description: "Use GPT-4, GPT-3.5, and other OpenAI models",
  },
  {
    id: Provider.GEMINI,
    label: "Gemini",
    icon: Gemini,
    description: "Use Google's Gemini Pro and Flash models",
  },
];

function validateApiKey(key: string, provider: Provider): boolean {
  if (!key.trim()) return false;
  return API_KEY_REGEX[provider].test(key);
}

function getProviderFromKeyPreview(keyPreview?: string | null): Provider | null {
  if (!keyPreview) return null;
  const normalized = keyPreview.trim();
  if (normalized === "Existing Key") return null;
  if (normalized.startsWith("sk-")) return Provider.OPENAI;
  if (normalized.startsWith("AI")) return Provider.GEMINI;
  return null;
}

function createInitialState(
  initialApiKey: string,
  initialProvider: Provider,
  preferredModel?: string,
): BYOKState {
  return {
    apiKey: initialApiKey,
    selectedProvider: initialProvider,
    selectedModel: preferredModel,
    localError: "",
    isSubmitting: false,
    showPassword: false,
    showSuccess: false,
  };
}

function byokReducer(state: BYOKState, action: BYOKAction): BYOKState {
  switch (action.type) {
    case "set-api-key":
      return { ...state, apiKey: action.payload };
    case "set-provider":
      return { ...state, selectedProvider: action.payload };
    case "set-model":
      return { ...state, selectedModel: action.payload };
    case "set-local-error":
      return { ...state, localError: action.payload };
    case "set-submitting":
      return { ...state, isSubmitting: action.payload };
    case "toggle-password-visibility":
      return { ...state, showPassword: !state.showPassword };
    case "set-show-success":
      return { ...state, showSuccess: action.payload };
    case "reset":
      return action.payload;
    default:
      return state;
  }
}

export function BYOK({
  isOpen = false,
  onClose,
  onValidate,
  onSaveApiKey,
  error: externalError = "",
  initialApiKey = "",
  initialProvider = Provider.OPENAI,
  keyPreview = null,
  hasExistingKey = false,
  preferredModel,
  onModelChange,
}: BYOKProps) {
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

  const providerMismatchError =
    hasExistingKey && !trimmedApiKey && !isExistingKeyCompatible
      ? `The active key might not be compatible with ${PROVIDERS_CONFIG.find((p) => p.id === selectedProvider)?.label}. Please provide a new key.`
      : "";

  const error =
    externalError ||
    providerMismatchError ||
    (!isApiKeyValid ? API_KEY_VALIDATION_ERROR[selectedProvider] : localError);

  const canSubmit =
    !isSubmitting &&
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
    if (!canSubmit || !onSaveApiKey) return;

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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleTabChange(value: string) {
    const newProvider = value as Provider;
    dispatch({ type: "set-provider", payload: newProvider });
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
        <div className="p-6 pb-4 border-b border-border/20 dark:border-white/[0.08] bg-background/50 dark:bg-white/[0.025] backdrop-blur-sm shrink-0">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground/90">
              {hasExistingKey ? "Manage Your API Key" : "Add Your API Key"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block italic text-muted-foreground/60 dark:text-muted-foreground/70">
                {hasExistingKey
                  ? "Update your API key to continue using the service."
                  : "Select a provider and enter your API key to get started."}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 dark:text-muted-foreground/50">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Encrypted storage • Principle-level security
              </span>
            </DialogDescription>
          </DialogHeader>

          {hasExistingKey && keyPreview && (
            <div className="mt-4 rounded-xl border border-border/40 dark:border-white/[0.1] bg-muted/30 dark:bg-white/[0.05] p-3.5 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground/50 dark:text-muted-foreground/70 uppercase tracking-widest">
                    Active key
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm tracking-tight text-foreground/70 dark:text-foreground/90">
                      {keyPreview}
                    </p>
                    {existingKeyProvider && (
                      <span className="rounded-full border border-border/60 dark:border-white/[0.15] bg-background/70 dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-foreground/60">
                        {existingKeyProvider === Provider.OPENAI ? "OpenAI" : "Gemini"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                  <Check className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          <div className="px-6 py-6">
            <Tabs value={selectedProvider} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-11 p-1 bg-muted/60 dark:bg-white/[0.06] transition-all border border-border/40 dark:border-white/[0.1]">
                {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="gap-2 rounded-lg data-[state=active]:bg-background dark:data-[state=active]:bg-white/[0.1] data-[state=active]:shadow-sm data-[state=active]:text-foreground dark:text-muted-foreground/80 transition-all"
                    aria-selected={selectedProvider === id}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="text-sm font-semibold">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {PROVIDERS_CONFIG.map(({ id }) => (
                <TabsContent
                  key={id}
                  value={id}
                  className="mt-6 space-y-6 outline-none focus-visible:ring-0"
                >
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 px-1">
                      Identity & Access
                    </p>
                    <ApiKeyInput
                      provider={id}
                      apiKey={apiKey}
                      showPassword={showPassword}
                      isSubmitting={isSubmitting}
                      error={error}
                      onChange={(nextApiKey) =>
                        dispatch({ type: "set-api-key", payload: nextApiKey })
                      }
                      onToggleVisibility={togglePasswordVisibility}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 px-1">
                      Engine Preference
                    </p>
                    <ModelSelector
                      provider={id}
                      selectedModelId={
                        selectedModel &&
                        getModelSpecByProvider(id, selectedModel) !== null
                          ? selectedModel
                          : undefined
                      }
                      onSelect={handleModelChange}
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>

        <div className="shrink-0 flex flex-col">
          {showSuccess && (
            <div className="px-6 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300 border-t border-border/10 bg-emerald-500/[0.03]">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-2.5">
                <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Credentials synchronized successfully.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 bg-muted/40 dark:bg-white/[0.04] border-t border-border/50 dark:border-white/[0.08] sm:justify-start gap-2.5 backdrop-blur-sm">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl h-12 font-semibold bg-background dark:bg-white/[0.06] border-border/50 dark:border-white/[0.12] hover:bg-muted/50 dark:hover:bg-white/[0.1] transition-colors text-muted-foreground dark:text-foreground/70 hover:text-foreground"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              className="flex-1 rounded-xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md dark:shadow-lg dark:shadow-primary/10 transition-all active:scale-[0.98]"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span className="tracking-tight">Initializing…</span>
                </div>
              ) : (
                <span className="tracking-tight">
                  {isModelOnlyUpdate ? "Save Preferences" : "Save API Key"}
                </span>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
