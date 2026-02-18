"use client";

import { m } from "motion/react";
import { LoaderIcon, X } from "lucide-react";

export function ChatLoadingState() {
  return (
    <div className="flex flex-col h-full items-center justify-center">
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <m.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <LoaderIcon className="h-8 w-8" />
        </m.div>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Loading conversation…
        </p>
      </m.div>
    </div>
  );
}

export function ChatErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm"
      >
        <m.div
          className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-red-500/10"
          initial={{ scale: 0.8, rotate: -5 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: "spring" }}
        >
          <X className="h-7 w-7 text-red-500" />
        </m.div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
          Unable to load conversation
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {message}
        </p>
      </m.div>
    </div>
  );
}