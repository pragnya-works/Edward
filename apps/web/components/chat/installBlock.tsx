"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { Package } from "lucide-react";

interface InstallBlockProps {
  dependencies: string[];
}

export const InstallBlock = memo(function InstallBlock({
  dependencies,
}: InstallBlockProps) {
  if (dependencies.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg sm:rounded-xl border border-sky-500/15 bg-sky-600/[0.05] dark:bg-sky-500/[0.03] p-2.5 sm:p-3 w-full"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-2.5">
        <motion.div
          className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-md bg-sky-500/15 flex items-center justify-center shrink-0"
          animate={{
            rotate: [0, 10, -10, 0],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Package className="h-2 sm:h-2.5 w-2 sm:w-2.5 text-sky-600 dark:text-sky-500/70" />
        </motion.div>
        <span className="text-[11px] sm:text-xs text-foreground/70 dark:text-muted-foreground/60 font-medium">
          Installing {dependencies.length} package
          {dependencies.length !== 1 ? "s" : ""}
        </span>
        <motion.div
          className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-[1.5px] border-sky-400/30 dark:border-sky-400/30 border-t-sky-500 dark:border-t-sky-400/70 shrink-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="flex flex-wrap gap-1 sm:gap-1.5">
        {dependencies.map((dep, i) => (
          <motion.div
            key={dep}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.15 }}
            className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-foreground/[0.08] dark:bg-foreground/[0.04] border border-border/30 text-[10px] sm:text-[11px] font-mono text-foreground/70 dark:text-muted-foreground/70"
          >
            {dep}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
});
