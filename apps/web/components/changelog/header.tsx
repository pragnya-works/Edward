"use client";

import { m } from "motion/react";
import { GitCommitHorizontal } from "lucide-react";

export function ChangelogHeader() {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="mb-12 md:mb-16 lg:mb-20 flex flex-col items-center text-center space-y-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 shadow-sm">
          <GitCommitHorizontal className="w-4 h-4 text-slate-700 dark:text-slate-300" />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-slate-500 dark:text-muted-foreground/60">
          Changelog
        </span>
      </div>
      
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-900 via-slate-800 to-slate-500 dark:from-white dark:via-white/90 dark:to-white/50 pb-2">
        Product Updates
      </h1>
      
      <p className="mt-2 text-[15px] md:text-base text-slate-600 dark:text-muted-foreground/80 max-w-[480px] leading-relaxed mx-auto">
        Track our progress. Discover the latest features, improvements, and fixes we have shipped.
      </p>
    </m.div>
  );
}
