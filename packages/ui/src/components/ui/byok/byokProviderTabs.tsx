import type { KeyboardEvent } from "react";
import type { Provider } from "@edward/shared/constants";
import { getModelSpecByProvider } from "@edward/shared/schema";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@edward/ui/components/tabs";
import { ApiKeyInput } from "@edward/ui/components/ui/apiKeyInput";
import { ModelSelector } from "@edward/ui/components/ui/modelSelector";
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
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="px-6 py-6">
        <Tabs value={selectedProvider} onValueChange={onTabChange}>
          <TabsList className="grid w-full grid-cols-2 rounded-xl h-11 p-1 bg-muted/60 dark:bg-white/[0.06] transition-all border border-border/40 dark:border-white/[0.1]">
            {PROVIDERS_CONFIG.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                disabled={isApiKeyActionDisabled}
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
                  isDisabled={isApiKeyActionDisabled}
                  error={error}
                  onChange={onApiKeyChange}
                  onToggleVisibility={onTogglePassword}
                  onKeyDown={onKeyDown}
                />
              </div>

              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 dark:text-muted-foreground/70 px-1">
                  Engine Preference
                </p>
                <div
                  className={
                    isApiKeyActionDisabled
                      ? "pointer-events-none opacity-60"
                      : undefined
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
