"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { Eye } from "lucide-react";
import { Provider } from "@edward/shared/constants";
import { getModelsByProvider } from "@edward/shared/schema";
import { ClaudeAI } from "@edward/ui/components/ui/claudeAi";
import { cn } from "@edward/ui/lib/utils";

interface ModelSelectorProps {
  provider: Provider;
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
  className?: string;
  listClassName?: string;
}

const ASSETS_URL = process.env.NEXT_PUBLIC_ASSETS_URL;

function getModelIconUrl(provider: Provider, modelId: string): string {
  return `${ASSETS_URL}/models/${provider}/${modelId}`;
}

function getProviderIcon(provider: Provider) {
  if (provider === Provider.ANTHROPIC) {
    return ClaudeAI;
  }

  return null;
}

export function ModelSelector({
  provider,
  selectedModelId,
  onSelect,
  className,
  listClassName,
}: ModelSelectorProps) {
  const models = useMemo(() => getModelsByProvider(provider), [provider]);
  const prefersReducedMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <div className={cn("w-full flex flex-col gap-2", className)}>
        <div
          className={cn(
            "grid gap-1.5 overflow-y-auto overscroll-contain scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            listClassName,
          )}
        >
          {models.map((model, index) => {
            const isSelected = selectedModelId === model.id;
            const iconUrl = getModelIconUrl(provider, model.id);
            const ProviderIcon = getProviderIcon(provider);
            const iconSize = provider === Provider.GEMINI ? 20 : 24;

            return (
              <m.button
                key={model.id}
                type="button"
                initial={
                  prefersReducedMotion
                    ? { opacity: 1, x: 0 }
                    : { opacity: 0, x: -4 }
                }
                animate={{ opacity: 1, x: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { delay: index * 0.02, ease: "easeOut" }
                }
                onClick={() => onSelect(model.id)}
                className={cn(
                  "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "bg-muted/30 dark:bg-primary/[0.03] border-primary/30 dark:border-primary/30 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-foreground/[0.02] dark:hover:bg-white/[0.03] hover:border-border/40 dark:hover:border-white/[0.06] hover:shadow-sm",
                )}
                aria-pressed={isSelected}
              >
                <div className="flex items-center gap-3.5 relative z-10 min-w-0 flex-1">
                  <div
                    className={cn(
                      "relative flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border transition-all duration-300 overflow-hidden",
                      isSelected
                        ? "bg-muted/50 border-primary/30 shadow-sm shadow-primary/5 dark:bg-primary dark:border-primary dark:shadow-md dark:shadow-primary/10"
                        : "bg-muted/20 dark:bg-muted/10 border-border group-hover:border-primary/20 text-muted-foreground group-hover:text-primary",
                    )}
                  >
                    {ProviderIcon ? (
                      <ProviderIcon
                        className={cn(
                          "h-5 w-5",
                          isSelected ? "text-foreground" : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                    ) : provider === Provider.OPENAI ? (
                      <Image
                        src={iconUrl}
                        alt={`${model.label} icon`}
                        fill
                        unoptimized
                        sizes="36px"
                        className="object-cover m-0 p-0"
                      />
                    ) : (
                      <Image
                        src={iconUrl}
                        alt={`${model.label} icon`}
                        width={iconSize}
                        height={iconSize}
                        unoptimized
                        className="object-contain m-0 p-0"
                      />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "text-[13px] font-semibold tracking-tight transition-colors truncate",
                          isSelected ? "text-foreground" : "text-foreground/90",
                        )}
                      >
                        {model.label}
                      </span>
                      {isSelected && (
                        <div className="h-1 w-1 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] leading-4 text-muted-foreground/70 dark:text-muted-foreground/60 truncate">
                      {model.description}
                    </span>
                  </div>
                </div>

                <div className="relative z-10 flex min-w-0 max-w-full items-center justify-end">
                  <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                    {model.supportsVision && (
                      <div
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          isSelected
                            ? "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400"
                            : "bg-muted/30 border-border/50 text-muted-foreground/50",
                        )}
                      >
                        <Eye className="h-2.5 w-2.5" />
                        <span>Vision</span>
                      </div>
                    )}
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="text-[9px] font-bold text-muted-foreground/50 dark:text-muted-foreground/30 uppercase tracking-widest">
                        Logic
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold tabular-nums",
                          model.reasoning === "Max" || model.reasoning === "Peak"
                            ? "text-emerald-500/90"
                            : model.reasoning === "High"
                              ? "text-blue-500/90"
                              : "text-muted-foreground/40",
                        )}
                      >
                        {model.reasoning}
                      </span>
                    </div>
                  </div>
                </div>

                {isSelected && !prefersReducedMotion && (
                  <>
                    <m.div
                      layoutId="active-pill"
                      className="absolute inset-0 rounded-xl pointer-events-none shadow-[0_0_0_1px_rgba(var(--color-primary),0.1)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.05)]"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    />
                    <m.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.02, 1],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 bg-primary/[0.01] rounded-xl pointer-events-none"
                    />
                  </>
                )}
              </m.button>
            );
          })}
        </div>
      </div>
    </LazyMotion>
  );
}
