"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { cn } from "@edward/ui/lib/utils";

interface TypingIndicatorProps {
  isCodeMode?: boolean;
}

export const TypingIndicator = memo(function TypingIndicator({
  isCodeMode,
}: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 p-2">
      <motion.div
        className="flex items-center gap-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isCodeMode
                ? "bg-gradient-to-tr from-amber-400 to-orange-400"
                : "bg-gradient-to-tr from-sky-400 to-indigo-400",
            )}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.2,
            }}
          />
        ))}
        <span
          className={cn(
            "ml-2 text-[10px] font-medium uppercase tracking-widest animate-pulse",
            isCodeMode
              ? "text-amber-600/60 dark:text-amber-400/50"
              : "text-sky-600/60 dark:text-sky-400/50",
          )}
        >
          {isCodeMode ? "Generating code" : "Edward is processing"}
        </span>
      </motion.div>
    </div>
  );
});
