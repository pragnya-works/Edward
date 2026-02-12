import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Provider } from "@edward/shared/constants";
import { getModelsByProvider } from "@edward/shared/schema";
import { cn } from "@edward/ui/lib/utils";
import { OpenAI } from "@edward/ui/components/ui/openAi";
import { Gemini } from "@edward/ui/components/ui/gemini";

const PROVIDER_ICONS: Record<Provider, React.ElementType> = {
  [Provider.OPENAI]: OpenAI,
  [Provider.GEMINI]: Gemini,
};

interface ModelSelectorProps {
  provider: Provider;
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({
  provider,
  selectedModelId,
  onSelect,
}: ModelSelectorProps) {
  const models = useMemo(() => getModelsByProvider(provider), [provider]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="grid gap-1.5">
        {models.map((model, index) => {
          const isSelected = selectedModelId === model.id;
          const isHovered = hoveredId === model.id;
          const Icon = PROVIDER_ICONS[provider];

          return (
            <motion.button
              key={model.id}
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
              onMouseEnter={() => setHoveredId(model.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(model.id)}
              className={cn(
                "group relative w-full flex items-center justify-between p-3 rounded-xl text-left transition-all duration-200 border",
                isSelected
                  ? "bg-primary/[0.05] dark:bg-primary/[0.03] border-primary/40 dark:border-primary/30 shadow-sm dark:shadow-[0_2px_10px_rgba(0,0,0,0.1)]"
                  : "bg-transparent border-transparent hover:bg-muted/15 dark:hover:bg-muted/10 hover:border-border/60 dark:hover:border-border/40",
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-center gap-3.5 relative z-10 min-w-0">
                <div
                  className={cn(
                    "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border transition-all duration-300",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/10"
                      : "bg-muted/10 border-border group-hover:border-primary/20 text-muted-foreground group-hover:text-primary",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
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
                  <span className="text-[11px] text-muted-foreground/60 truncate">
                    {model.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 relative z-10 shrink-0 ml-4">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">
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

              {isSelected && !prefersReducedMotion && (
                <>
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 border border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.04] rounded-xl pointer-events-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.05)]"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                  <motion.div
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
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
