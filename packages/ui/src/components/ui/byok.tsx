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
} from "@workspace/ui/constants/apiKey.constants";
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
}

const PROVIDERS_CONFIG = [
  {
    id: Provider.OPENAI,
    label: "OpenAI",
    icon: OpenAI,
  },
  {
    id: Provider.GEMINI,
    label: "Gemini",
    icon: Gemini,
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
}: BYOKProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    initialProvider
  );
  const [localError, setLocalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const error = externalError || localError;

  useEffect(() => {
    if (isOpen) {
      setApiKey(initialApiKey);
      setSelectedProvider(initialProvider);
      setLocalError("");
    } else {
      setApiKey("");
      setLocalError("");
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
      await onSaveApiKey(apiKey, onValidate, onClose, selectedProvider);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialApiKey ? "Manage Your API Key" : "Add Your API Key"}
          </DialogTitle>
          <DialogDescription>
            Select a provider and enter your API key to continue. Your key is
            stored securely on our servers.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedProvider} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDERS_CONFIG.map(({ id }) => (
            <TabsContent key={id} value={id} className="mt-4">
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={
              !apiKey.trim() ||
              isSubmitting ||
              !validateApiKey(apiKey, selectedProvider)
            }
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}