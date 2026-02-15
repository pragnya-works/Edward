"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { Terminal, Check, X } from "lucide-react";
import type { CommandEvent } from "@/lib/chatTypes";

interface CommandBlockProps {
  command: CommandEvent;
}

export const CommandBlock = memo(function CommandBlock({
  command,
}: CommandBlockProps) {
  const hasExitCode = command.exitCode !== undefined;
  const isSuccess = command.exitCode === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-border/40 overflow-hidden bg-foreground/[0.02]"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] border-b border-border/20">
        <Terminal className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400/70 shrink-0" />
        <span className="text-[11px] font-mono text-foreground/80 dark:text-muted-foreground/70 truncate flex-1">
          {command.command}
          {command.args?.length ? ` ${command.args.join(" ")}` : ""}
        </span>
        {hasExitCode && (
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
              isSuccess
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/10 text-red-700 dark:text-red-400"
            }`}
          >
            {isSuccess ? (
              <Check className="h-2.5 w-2.5" />
            ) : (
              <X className="h-2.5 w-2.5" />
            )}
            <span>{command.exitCode}</span>
          </div>
        )}
        {!hasExitCode && (
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </div>

      {(command.stdout || command.stderr) && (
        <div className="max-h-40 overflow-y-auto">
          {command.stdout && (
            <pre className="px-3 py-2 text-[11px] leading-[1.65] font-mono text-foreground/80 dark:text-foreground/60 whitespace-pre-wrap break-all">
              {command.stdout}
            </pre>
          )}
          {command.stderr && (
            <pre className="px-3 py-2 text-[11px] leading-[1.65] font-mono text-red-600 dark:text-red-400/70 whitespace-pre-wrap break-all border-t border-red-500/10">
              {command.stderr}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  );
});
