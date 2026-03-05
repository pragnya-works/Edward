"use client";

import { memo } from "react";
import { m } from "motion/react";
import { cn } from "@edward/ui/lib/utils";

interface TypingIndicatorProps {
  isCodeMode?: boolean;
}

const FEATURE_TYPING_DOT_DELAYS = [0, 0.2, 0.4] as const;

export const TypingIndicator = memo(function TypingIndicator({
  isCodeMode,
}: TypingIndicatorProps) {
  const dotClassName = isCodeMode
    ? "bg-gradient-to-tr from-amber-400 to-orange-400"
    : "bg-foreground/55 dark:bg-foreground/70";

  if (!isCodeMode) {
    return (
      <div className="flex items-start leading-none">
        <m.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="inline-flex items-center justify-center rounded-[20px] border border-border/45 bg-foreground/[0.04] px-3 py-2 sm:px-4 sm:py-2.5 min-w-12 sm:min-w-14 dark:border-border/70 dark:bg-foreground/[0.08]"
        >
          <div className="flex items-center justify-center gap-1">
            {FEATURE_TYPING_DOT_DELAYS.map((delay) => (
              <m.div
                key={`feature-typing-dot-${delay}`}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay }}
                className={cn("w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full", dotClassName)}
              />
            ))}
          </div>
        </m.div>
      </div>
    );
  }

  return (
    <div className="flex items-start leading-none">
      <m.div
        className="inline-flex items-center gap-0.5 sm:gap-1 px-1 py-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {FEATURE_TYPING_DOT_DELAYS.map((delay) => (
          <m.div
            key={`typing-dot-${delay}`}
            className={cn("h-1 sm:h-1.5 w-1 sm:w-1.5 rounded-full", dotClassName)}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
          />
        ))}
      </m.div>
    </div>
  );
});
