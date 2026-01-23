import { useState, useEffect, type KeyboardEvent } from "react";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { OpenAI } from "@workspace/ui/components/ui/openAi";
import { Gemini } from "@workspace/ui/components/ui/gemini";
import {
  Provider,
  API_KEY_REGEX,
  API_KEY_VALIDATION_ERROR,
} from "@workspace/shared/constants";
import { ApiKeyInput } from "@workspace/ui/components/ui/apiKeyInput";

interface BYOKProps {
  isOpen?: boolean;
  onClose: () => void;
  onValidate: (key: string) => void;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider
  ) => Promise<boolean>;
  error?: string;
  initialApiKey?: string;
  initialProvider?: Provider;
  keyPreview?: string | null;
  hasExistingKey?: boolean;
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
}: BYOKProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    initialProvider
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
      setLocalError("");
      setShowSuccess(false);
    } else {
      setApiKey("");
      setLocalError("");
      setShowSuccess(false);
    }
  }, [isOpen, initialApiKey, initialProvider]);

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
      const success = await onSaveApiKey(apiKey, onValidate, onClose, selectedProvider);
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
    setLocalError("");
  }

  function togglePasswordVisibility() {
    setShowPassword((prev) => !prev);
  }

  const selectedProviderConfig = PROVIDERS_CONFIG.find(
    (p) => p.id === selectedProvider
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasExistingKey ? "Manage Your API Key" : "Add Your API Key"}
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              {hasExistingKey
                ? "Update your API key to continue using the service."
                : "Select a provider and enter your API key to get started."}
            </span>
            <span className="block text-xs text-muted-foreground">
              🔒 Your key is encrypted and stored securely. We never log or expose your full key.
            </span>
          </DialogDescription>
        </DialogHeader>

        {hasExistingKey && keyPreview && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Current Key</p>
                <p className="font-mono text-sm">{keyPreview}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                <svg
                  className="h-4 w-4 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        <Tabs value={selectedProvider} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDERS_CONFIG.map(({ id, description }) => (
            <TabsContent key={id} value={id} className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{description}</p>
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
            </TabsContent>
          ))}
        </Tabs>

        {showSuccess && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ API key saved successfully!
            </p>
          </div>
        )}

        <DialogFooter className="flex flex-row gap-2 sm:gap-2!">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1 text-foreground/70"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <Button
            size="lg"
            className="flex-1"
            onClick={handleSubmit}
            disabled={
              !apiKey.trim() ||
              isSubmitting ||
              !validateApiKey(apiKey, selectedProvider)
            }
          >
            {isSubmitting ? (
              <>
                <svg
                  className="mr-2 h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}