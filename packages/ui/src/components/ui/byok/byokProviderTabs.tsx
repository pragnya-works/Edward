import type { KeyboardEvent } from "react";
import { Provider } from "@edward/shared/constants";
import { getModelSpecByProvider } from "@edward/shared/schema";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@edward/ui/components/tabs";
import { Badge } from "@edward/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@edward/ui/components/tooltip";
import { ApiKeyInput } from "@edward/ui/components/ui/apiKeyInput";
import { ModelSelector } from "@edward/ui/components/ui/modelSelector";
import { cn } from "@edward/ui/lib/utils";
import { PROVIDERS_CONFIG } from "./byok.utils";

interface BYOKProviderTabsProps {
  selectedProvider: Provider;
  isApiKeyActionDisabled: boolean;
  apiKey: string;
  showPassword: boolean;
  error: string;
  selectedModel?: string;
  onTabChange: (value: string) => void;
  onApiKeyChange: (nextApiKey: string) => void;
  onTogglePassword: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onModelChange: (modelId: string) => void;
}

export function BYOKProviderTabs({
  selectedProvider,
  isApiKeyActionDisabled,
  apiKey,
  showPassword,
  error,
  selectedModel,
  onTabChange,
  onApiKeyChange,
  onTogglePassword,
  onKeyDown,
  onModelChange,
}: BYOKProviderTabsProps) {
  const hasError = error.trim().length > 0;

  return (
    <div className="flex-1 min-h-0">
      <div
        className={cn(
          "px-6 h-full min-h-0 flex flex-col",
          hasError ? "py-4" : "py-5",
        )}
      >
        <Tabs
          value={selectedProvider}
          onValueChange={onTabChange}
          className="h-full min-h-0"
        >
          <div className="pt-2 sm:pt-3">
            <TabsList className="grid w-full grid-cols-2 rounded-xl h-11 p-1 bg-muted/60 dark:bg-white/[0.06] transition-all border border-border/40 dark:border-white/[0.1]">
              {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  disabled={isApiKeyActionDisabled}
                  className="relative overflow-visible gap-2 rounded-lg data-[state=active]:bg-background dark:data-[state=active]:bg-white/[0.1] data-[state=active]:shadow-sm data-[state=active]:text-foreground dark:text-muted-foreground/80 transition-all"
                  aria-selected={selectedProvider === id}
                >
                  {id === Provider.OPENAI ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge
                            variant="outline"
                            className="absolute -top-4 right-1.5 sm:-top-3 sm:right-0 h-4 px-1.5 sm:px-2 text-[7px] sm:text-[8px] font-semibold tracking-[0.08em] uppercase border-amber-300 bg-amber-100 text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 cursor-help"
                            aria-label="Why OpenAI is recommended for Edward"
                          >
                            Recommended
                          </Badge>
                        }
                      />
                      <TooltipPositioner side="top" align="end">
                        <TooltipContent className="max-w-[220px] leading-relaxed">
                          Recommended because OpenAI gives <strong>Edward</strong> the most
                          consistent code quality, tool reliability, and lower
                          runtime failures.
                        </TooltipContent>
                      </TooltipPositioner>
                    </Tooltip>
                  ) : null}
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-semibold">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {PROVIDERS_CONFIG.map(({ id }) => (
            <TabsContent
              key={id}
              value={id}
              className={cn(
                "mt-5 min-h-0 flex flex-col outline-none focus-visible:ring-0 overflow-hidden",
                hasError ? "gap-4" : "gap-5",
              )}
            >
              <div className="space-y-2 shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 px-1">
                  Identity & Access
                </p>
                <ApiKeyInput
                  provider={id}
                  apiKey={apiKey}
                  showPassword={showPassword}
                  isDisabled={isApiKeyActionDisabled}
                  error={error}
                  onChange={onApiKeyChange}
                  onToggleVisibility={onTogglePassword}
                  onKeyDown={onKeyDown}
                />
              </div>

              <div className="space-y-2 flex-1 basis-0 min-h-0 flex flex-col">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 px-1">
                  Engine Preference
                </p>
                <div
                  className={
                    isApiKeyActionDisabled
                      ? "flex-1 min-h-0 pointer-events-none opacity-60"
                      : "flex-1 min-h-0"
                  }
                >
                  <ModelSelector
                    provider={id}
                    selectedModelId={
                      selectedModel &&
                      getModelSpecByProvider(id, selectedModel) !== null
                        ? selectedModel
                        : undefined
                    }
                    onSelect={onModelChange}
                    className="h-full min-h-0"
                    listClassName="flex-1 min-h-0 pr-1"
                  />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
