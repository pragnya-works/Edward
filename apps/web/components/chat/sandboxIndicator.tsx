"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { Box } from "lucide-react";

export const SandboxIndicator = memo(function SandboxIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-500/[0.04] border border-amber-500/15"
    >
      <motion.div
        className="h-4 w-4 rounded-md bg-amber-500/15 flex items-center justify-center"
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(245, 158, 11, 0)",
            "0 0 6px 1px rgba(245, 158, 11, 0.12)",
            "0 0 0 0 rgba(245, 158, 11, 0)",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Box className="h-2.5 w-2.5 text-amber-600 dark:text-amber-500/70" />
      </motion.div>

      <span className="text-xs text-muted-foreground/80 dark:text-muted-foreground/60 font-medium">
        Setting up environment
      </span>

      <div className="flex items-center gap-0.5 ml-0.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1 w-1 rounded-full bg-amber-500/60 dark:bg-amber-500/40"
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
});
