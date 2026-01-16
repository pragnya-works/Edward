import { useState } from "react";
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
}

export function BYOK({
  isOpen = false,
  onClose,
  onValidate,
  onSaveApiKey,
  error: externalError = "",
}: BYOKProps) {
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    Provider.OPENAI
  );
  const [localError, setLocalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const error = externalError || localError;

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleTabChange(value: string) {
    setSelectedProvider(value as Provider);
    setApiKey("");
    setLocalError("");
  }

  function togglePasswordVisibility() {
    setShowPassword((prev) => !prev);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Your API Key</DialogTitle>
          <DialogDescription>
            Select a provider and enter your API key to continue. Your key is
            stored securely on our servers.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedProvider} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value={Provider.OPENAI} className="gap-2">
              <OpenAI className="h-4 w-4" />
              <span>OpenAI</span>
            </TabsTrigger>

            <TabsTrigger value={Provider.GEMINI} className="gap-2">
              <Gemini className="h-4 w-4" />
              <span>Gemini</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={Provider.OPENAI} className="mt-4">
            <ApiKeyInput
              provider={Provider.OPENAI}
              apiKey={apiKey}
              showPassword={showPassword}
              isSubmitting={isSubmitting}
              error={error}
              onChange={setApiKey}
              onToggleVisibility={togglePasswordVisibility}
              onKeyDown={handleKeyDown}
            />
          </TabsContent>

          <TabsContent value={Provider.GEMINI} className="mt-4">
            <ApiKeyInput
              provider={Provider.GEMINI}
              apiKey={apiKey}
              showPassword={showPassword}
              isSubmitting={isSubmitting}
              error={error}
              onChange={setApiKey}
              onToggleVisibility={togglePasswordVisibility}
              onKeyDown={handleKeyDown}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
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