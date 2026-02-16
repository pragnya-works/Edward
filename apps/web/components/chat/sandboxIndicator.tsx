"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { Sparkles, Loader2 } from "lucide-react";

export const SandboxIndicator = memo(function SandboxIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{
        duration: 0.35,
        ease: [0.23, 1, 0.32, 1],
        layout: { duration: 0.25 },
      }}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-primary/8 via-primary/5 to-primary/8 border border-primary/20 shadow-lg shadow-primary/5"
    >
      <motion.div
        className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 relative overflow-hidden"
        initial={{ rotate: -10, scale: 0.8 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      >
        <motion.div
          className="absolute inset-0 bg-primary/10"
          animate={{
            opacity: [0, 0.3, 0],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, 0, -5, 0],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-4 w-4 text-primary" />
        </motion.div>
      </motion.div>

      <div className="flex flex-col min-w-0 flex-1">
        <motion.span
          className="text-[12px] font-semibold text-foreground"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          Workspace Active
        </motion.span>
        <motion.div
          className="flex items-center gap-1.5"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <span className="text-[10px] text-muted-foreground">
            Setting up environment
          </span>
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-[10px] text-muted-foreground"
          >
            ...
          </motion.span>
        </motion.div>
      </div>

      <motion.div
        className="flex items-center gap-2 shrink-0"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-4 w-4 text-primary/70" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
});
