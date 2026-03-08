import { Button } from "@edward/ui/components/button";
import { Input } from "@edward/ui/components/input";
import { Label } from "@edward/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import {
  Provider,
  API_KEY_LABEL,
  API_KEY_PLACEHOLDER,
  PROVIDER_DISPLAY_NAME,
} from "@edward/shared/constants";

interface ApiKeyInputProps {
  provider: Provider;
  apiKey: string;
  showPassword: boolean;
  isDisabled: boolean;
  error?: string;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function ApiKeyInput({
  provider,
  apiKey,
  showPassword,
  isDisabled,
  error,
  onChange,
  onToggleVisibility,
  onKeyDown,
}: ApiKeyInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 p-1">
        <Label htmlFor={`apiKey-${provider}`}>
          {API_KEY_LABEL[provider]}
        </Label>

        <div className="relative">
          <Input
            id={`apiKey-${provider}`}
            type={showPassword ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={API_KEY_PLACEHOLDER[provider]}
            className="pr-10 rounded-xl h-12"
            disabled={isDisabled}
            spellCheck={false}
            autoComplete="off"
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute inset-y-0 right-0 h-full px-3 rounded-l-none hover:bg-transparent"
            onClick={onToggleVisibility}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {provider === Provider.OPENAI
            ? "Enter your OpenAI API key (starts with sk-proj-)"
            : provider === Provider.GEMINI
              ? "Enter your Gemini API key (starts with AI)"
              : `Enter your ${PROVIDER_DISPLAY_NAME[provider]} API key (starts with sk-ant-)`}
        </p>
      </div>

      {error && (
        <p className="text-xs font-medium leading-snug text-destructive">{error}</p>
      )}
    </div>
  );
}
