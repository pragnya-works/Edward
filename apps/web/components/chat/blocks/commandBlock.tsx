"use client";

import { memo, useMemo, useState } from "react";
import { m } from "motion/react";
import { ChevronDown, Circle, Terminal } from "lucide-react";
import type { CommandEvent } from "@edward/shared/streamEvents";
import { sanitizeTerminalOutput } from "@/lib/parsing/terminalOutput";

interface CommandBlockProps {
  command: CommandEvent;
}

export const CommandBlock = memo(function CommandBlock({
  command,
}: CommandBlockProps) {
  const stdout = useMemo(
    () => sanitizeTerminalOutput(command.stdout),
    [command.stdout],
  );
  const stderr = useMemo(
    () => sanitizeTerminalOutput(command.stderr),
    [command.stderr],
  );
  const hasExitCode = command.exitCode !== undefined;
  const isSuccess = command.exitCode === 0;
  const hasOutput = Boolean(stdout || stderr);
  const commandText = useMemo(
    () => [command.command, ...(command.args ?? [])].filter(Boolean).join(" "),
    [command.args, command.command],
  );
  const [showOutput, setShowOutput] = useState(Boolean(stderr));

  const statusLabel = hasExitCode
    ? isSuccess
      ? "Success"
      : "Failed"
    : "Issued";
  const statusClassName = hasExitCode
    ? isSuccess
      ? "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-400/50 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-300"
    : "border-zinc-300/80 bg-zinc-100/90 text-zinc-700 dark:border-border/60 dark:bg-foreground/[0.04] dark:text-foreground/70";

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full overflow-hidden rounded-lg sm:rounded-xl border border-zinc-200/90 bg-zinc-50/90 shadow-[0_1px_0_rgba(24,24,27,0.06)] dark:border-border/45 dark:bg-background/45 dark:shadow-none"
    >
      <div className="flex items-center gap-2 px-2.5 sm:px-3 py-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-300/70 bg-white/90 dark:border-border/40 dark:bg-foreground/[0.035]">
          <Terminal className="h-3 w-3 text-zinc-700 dark:text-foreground/75" />
        </div>

        <p className="min-w-0 flex-1 truncate font-mono text-[11px] sm:text-[12px] text-zinc-800 dark:text-foreground/85">
          $ {commandText}
        </p>

        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium ${statusClassName}`}
        >
          <Circle className="h-1.5 w-1.5 fill-current" />
          {statusLabel}
          {hasExitCode ? ` ${command.exitCode}` : ""}
        </span>

        {hasOutput ? (
          <button
            type="button"
            onClick={() => setShowOutput((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] sm:text-[10px] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-foreground/60 dark:hover:text-foreground/85 dark:hover:bg-foreground/[0.04] transition-colors"
            aria-expanded={showOutput}
            aria-label={showOutput ? "Hide command output" : "Show command output"}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showOutput ? "rotate-180" : ""}`}
            />
            {showOutput ? "Hide" : "Output"}
          </button>
        ) : null}
      </div>

      {hasOutput && showOutput ? (
        <div className="border-t border-zinc-200/80 px-2.5 sm:px-3 py-2 space-y-1.5 bg-white/70 dark:border-border/30 dark:bg-foreground/[0.02]">
          {stdout ? (
            <pre className="font-mono text-[10px] sm:text-[11px] leading-[1.55] text-zinc-700 dark:text-foreground/80 whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {stdout}
            </pre>
          ) : null}
          {stderr ? (
            <pre className="font-mono text-[10px] sm:text-[11px] leading-[1.55] text-rose-700 dark:text-rose-300 whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {stderr}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!hasExitCode && !hasOutput ? (
        <div className="px-2.5 sm:px-3 pb-2 text-[9px] sm:text-[10px] text-zinc-500 dark:text-foreground/50">
          Check terminal for command result
        </div>
      ) : null}
    </m.div>
  );
});
