"use client";

import React, { useMemo } from "react";
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
import { cn } from "@edward/ui/lib/utils";

interface ModelSelectorProps {
  provider: Provider;
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}

const ASSETS_URL = process.env.NEXT_PUBLIC_ASSETS_URL;

function getModelIconUrl(provider: Provider, modelId: string): string {
  return `${ASSETS_URL}/models/${provider}/${modelId}`;
}

export function ModelSelector({
  provider,
  selectedModelId,
  onSelect,
}: ModelSelectorProps) {
  const models = useMemo(() => getModelsByProvider(provider), [provider]);
  const prefersReducedMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <div className="w-full flex flex-col gap-2">
        <div className="grid gap-1.5">
          {models.map((model, index) => {
            const isSelected = selectedModelId === model.id;
            const iconUrl = getModelIconUrl(provider, model.id);
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
                  "group relative w-full flex items-center justify-between p-3 rounded-xl text-left transition-all duration-200 border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "bg-muted/30 dark:bg-primary/[0.03] border-primary/30 dark:border-primary/30 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-foreground/[0.02] dark:hover:bg-white/[0.03] hover:border-border/40 dark:hover:border-white/[0.06] hover:shadow-sm",
                )}
                aria-pressed={isSelected}
              >
                <div className="flex items-center gap-3.5 relative z-10 min-w-0">
                  <div
                    className={cn(
                      "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border transition-all duration-300",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/10"
                        : "bg-muted/20 dark:bg-muted/10 border-border group-hover:border-primary/20 text-muted-foreground group-hover:text-primary",
                    )}
                  >
                    <Image
                      src={iconUrl}
                      alt={`${model.label} icon`}
                      width={iconSize}
                      height={iconSize}
                      unoptimized
                      className="object-contain m-0 p-0"
                    />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[13px] font-semibold tracking-tight transition-colors truncate",
                          isSelected ? "text-foreground" : "text-foreground/90",
                        )}
                      >
                        {model.label}
                      </span>
                      {isSelected && (
                        <div className="h-1 w-1 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/60 truncate">
                      {model.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 relative z-10 shrink-0 ml-4">
                  <div className="flex items-center gap-2">
                    {model.supportsVision && (
                      <div
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider",
                          isSelected
                            ? "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400"
                            : "bg-muted/30 border-border/50 text-muted-foreground/50",
                        )}
                      >
                        <Eye className="h-2.5 w-2.5" />
                        <span>Vision</span>
                      </div>
                    )}
                    <div className="flex flex-col items-end">
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
