"use client";

import { motion } from "motion/react";
import { GitCommitHorizontal } from "lucide-react";

export function ChangelogHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="mb-12 md:mb-16 lg:mb-20"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/5 border border-primary/10">
          <GitCommitHorizontal className="w-4 h-4 text-primary/70" />
        </div>
        <span className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground/60">
          Updates
        </span>
      </div>
      
      <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
        Changelog
      </h1>
      
      <p className="mt-3 text-base md:text-lg text-muted-foreground/80 max-w-lg leading-relaxed">
        Track our progress. New features, improvements, and fixes as we build Edward.
      </p>
    </motion.div>
  );
}
