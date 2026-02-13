"use client";

import { useState, useEffect, type KeyboardEvent } from "react";
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
import { getDefaultModel } from "@edward/shared/schema";
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
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [selectedProvider, setSelectedProvider] =
    useState<Provider>(initialProvider);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    preferredModel,
  );
  const [localError, setLocalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const error = externalError || localError;

  useEffect(() => {
    if (isOpen) {
      setApiKey(initialApiKey);
      setSelectedProvider(initialProvider);
      setSelectedModel(preferredModel);
      setLocalError("");
      setShowSuccess(false);
    } else {
      setApiKey("");
      setLocalError("");
      setShowSuccess(false);
    }
  }, [isOpen, initialApiKey, preferredModel, initialProvider]);

  function handleModelChange(modelId: string) {
    setSelectedModel(modelId);
    onModelChange?.(modelId);
  }

  function validateApiKey(key: string, provider: Provider): boolean {
    if (!key.trim()) return false;
    return API_KEY_REGEX[provider].test(key);
  }

  async function handleSubmit() {
    if (isSubmitting || !onSaveApiKey) return;

    if (!validateApiKey(apiKey, selectedProvider)) {
      setLocalError(API_KEY_VALIDATION_ERROR[selectedProvider]);
      return;
    }

    setIsSubmitting(true);
    setLocalError("");

    try {
      const success = await onSaveApiKey(
        apiKey,
        onValidate,
        onClose,
        selectedProvider,
        selectedModel,
      );
      if (success) {
        setShowSuccess(true);
      }
    } catch {
      setLocalError("Failed to save API key. Please try again.");
    } finally {
      setIsSubmitting(false);
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
    setSelectedProvider(newProvider);

    if (!selectedModel) {
      setSelectedModel(getDefaultModel(newProvider));
    }

    setLocalError("");
  }

  function togglePasswordVisibility() {
    setShowPassword((prev) => !prev);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[440px] w-[95vw] p-0 overflow-hidden border-border/40 gap-0 max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl">
        <div className="p-6 pb-4 border-b border-border/5 bg-background/50 backdrop-blur-sm shrink-0">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground/90">
              {hasExistingKey ? "Manage Your API Key" : "Add Your API Key"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block italic text-muted-foreground/60 dark:text-muted-foreground/50">
                {hasExistingKey
                  ? "Update your API key to continue using the service."
                  : "Select a provider and enter your API key to get started."}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 dark:text-muted-foreground/30">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Encrypted storage • Principle-level security
              </span>
            </DialogDescription>
          </DialogHeader>

          {hasExistingKey && keyPreview && (
            <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 p-3.5 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground/50 dark:text-muted-foreground/40 uppercase tracking-widest">
                    Active key
                  </p>
                  <p className="font-mono text-sm tracking-tight text-foreground/70">
                    {keyPreview}
                  </p>
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
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-11 p-1 bg-muted/60 dark:bg-muted/50 transition-all border border-border/40 dark:border-border/30">
                {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground/70 transition-all"
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
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/40 px-1">
                      Identity & Access
                    </p>
                    <ApiKeyInput
                      provider={id}
                      apiKey={apiKey}
                      showPassword={showPassword}
                      isSubmitting={isSubmitting}
                      error={error}
                      onChange={setApiKey}
                      onToggleVisibility={togglePasswordVisibility}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/40 px-1">
                      Engine Preference
                    </p>
                    <ModelSelector
                      provider={id}
                      selectedModelId={selectedModel}
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

          <DialogFooter className="px-6 py-4 bg-muted/40 dark:bg-muted/20 border-t border-border/50 dark:border-border/30 sm:justify-start gap-2.5 backdrop-blur-sm">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl h-12 font-semibold bg-background border-border/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              className="flex-1 rounded-xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md dark:shadow-lg dark:shadow-primary/10 transition-all active:scale-[0.98]"
              onClick={handleSubmit}
              disabled={
                !apiKey.trim() ||
                isSubmitting ||
                !validateApiKey(apiKey, selectedProvider)
              }
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span className="tracking-tight">Initializing…</span>
                </div>
              ) : (
                <span className="tracking-tight">Save API Key</span>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
