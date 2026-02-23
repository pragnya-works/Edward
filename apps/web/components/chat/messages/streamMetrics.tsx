"use client";

import { m } from "motion/react";
import { Timer, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipPositioner,
} from "@edward/ui/components/tooltip";

interface MessageMetricsProps {
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export function MessageMetrics({
  completionTime,
  inputTokens,
  outputTokens,
}: MessageMetricsProps) {
  if (!completionTime && !inputTokens && !outputTokens) return null;

  const timeSeconds = completionTime
    ? (completionTime / 1000).toFixed(1)
    : null;
  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1 sm:gap-1.5 px-0.5 sm:px-1"
    >
      {timeSeconds && (
        <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-full bg-foreground/[0.03] border border-foreground/[0.05] text-[9px] sm:text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tight select-none transition-colors hover:bg-foreground/[0.05] h-4 sm:h-5 cursor-default">
          <Timer className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-sky-500/70" />
          <span>{timeSeconds}s</span>
        </div>
      )}
      {totalTokens > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-0.5 rounded-full bg-foreground/[0.03] border border-foreground/[0.05] text-[9px] sm:text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tight select-none transition-colors hover:bg-foreground/[0.05] h-4 sm:h-5 cursor-default">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-500/70" />
                  <span>{totalTokens}</span>
                </div>
                {inputTokens !== null && outputTokens !== null && (
                  <div className="flex items-center gap-1 sm:gap-2 pl-1.5 sm:pl-2 border-l border-foreground/[0.08] ml-0.5 leading-none">
                    <div className="flex items-center gap-0.5 text-muted-foreground/40 font-mono lowercase">
                      <span className="text-[7px] sm:text-[8px] opacity-70">
                        ↓
                      </span>
                      <span className="text-[8px] sm:text-[9px]">
                        {inputTokens}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 text-muted-foreground/40 font-mono lowercase">
                      <span className="text-[7px] sm:text-[8px] opacity-70">
                        ↑
                      </span>
                      <span className="text-[8px] sm:text-[9px]">
                        {outputTokens}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            }
          />
          <TooltipPositioner>
            <TooltipContent className="rounded-lg sm:rounded-xl px-0 py-0 border border-foreground/[0.05] bg-background text-foreground shadow-2xl overflow-hidden min-w-[100px] sm:min-w-[120px]">
              <div className="flex flex-col">
                <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-foreground/[0.03]">
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Token Breakdown
                  </span>
                </div>
                <div className="p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
                  <div className="flex items-center justify-between gap-3 sm:gap-4 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-foreground/[0.02]">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[10px] sm:text-xs opacity-50">
                        ↓
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-medium opacity-70">
                        Prompt
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold">
                      {inputTokens}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:gap-4 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-foreground/[0.02]">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[10px] sm:text-xs opacity-50">
                        ↑
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-medium opacity-70">
                        Completion
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold">
                      {outputTokens}
                    </span>
                  </div>
                </div>
                <div className="px-2 sm:px-3 py-1.5 sm:py-2 bg-foreground/[0.02] border-t border-foreground/[0.03] flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Total
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold text-amber-500">
                    {totalTokens}
                  </span>
                </div>
              </div>
            </TooltipContent>
          </TooltipPositioner>
        </Tooltip>
      )}
    </m.div>
  );
}
