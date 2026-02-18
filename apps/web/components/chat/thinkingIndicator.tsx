"use client";

import { memo, useMemo } from "react";
import { m } from "motion/react";
import { Brain, Zap } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@edward/ui/components/accordion";
import { cn } from "@edward/ui/lib/utils";
import { useTimer } from "@/hooks/useTimer";
import { MarkdownRenderer } from "./markdownRenderer";

interface ThinkingIndicatorProps {
  text: string;
  isActive: boolean;
  duration?: number | null;
  isCodeMode?: boolean;
}

const EDWARD_TAGS_REGEX =
  /<(Thinking|Response|edward_install|edward_sandbox|edward_command|edward_web_search|edward_url_scrape|edward_done|file|file_start|file_end)[^>]*>|<\/(Thinking|Response|edward_install|edward_sandbox|edward_command|edward_web_search|edward_url_scrape|edward_done|file|file_start|file_end)>/gi;

export const ThinkingIndicator = memo(function ThinkingIndicator({
  text,
  isActive,
  duration,
  isCodeMode = false,
}: ThinkingIndicatorProps) {
  const elapsed = useTimer(isActive);
  const hasValidDuration = (duration ?? 0) > 0;
  const displayDuration = isActive
    ? elapsed
    : hasValidDuration
      ? duration
      : null;

  const cleanedText = useMemo(
    () => text.replace(EDWARD_TAGS_REGEX, ""),
    [text],
  );

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      <Accordion className="w-full border-none" defaultValue={["thinking"]}>
        <AccordionItem
          value="thinking"
          className={cn(
            "rounded-lg sm:rounded-xl border border-border/50 dark:border-foreground/[0.04] overflow-hidden transition-all duration-300",
            isCodeMode
              ? "bg-amber-50 dark:bg-amber-400/[0.01]"
              : "bg-violet-50 dark:bg-sky-400/[0.01]",
          )}
        >
          <AccordionTrigger
            className={cn(
              "flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 w-full text-left group cursor-pointer transition-colors hover:no-underline touch-manipulation",
              isCodeMode
                ? "hover:bg-amber-100 dark:hover:bg-amber-500/[0.04]"
                : "hover:bg-violet-100 dark:hover:bg-violet-500/[0.04]",
              isActive
                ? isCodeMode
                  ? "bg-amber-100/50 dark:bg-amber-500/[0.02]"
                  : "bg-violet-100/50 dark:bg-violet-500/[0.02]"
                : undefined,
            )}
          >
            <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
              <div className="relative shrink-0">
                {isActive ? (
                  <m.div
                    className={cn(
                      "h-4 w-4 sm:h-5 sm:w-5 rounded-md flex items-center justify-center",
                      isCodeMode
                        ? "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20"
                        : "bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-500/20 dark:to-purple-500/20",
                    )}
                    animate={{
                      scale: [1, 1.05, 1],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Zap
                      className={cn(
                        "h-2.5 w-2.5 sm:h-3 sm:w-3",
                        isCodeMode
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-violet-600 dark:text-violet-400",
                      )}
                    />
                  </m.div>
                ) : (
                  <div
                    className={cn(
                      "h-4 w-4 sm:h-5 sm:w-5 rounded-md flex items-center justify-center",
                      isCodeMode
                        ? "bg-amber-100 dark:bg-amber-500/10"
                        : "bg-violet-100 dark:bg-violet-500/10",
                    )}
                  >
                    <Brain
                      className={cn(
                        "h-2.5 w-2.5 sm:h-3 sm:w-3",
                        isCodeMode
                          ? "text-amber-600 dark:text-amber-400 opacity-80"
                          : "text-violet-600 dark:text-violet-400 opacity-80",
                      )}
                    />
                  </div>
                )}
              </div>

              <span className="text-[11px] sm:text-xs font-medium text-foreground/80 flex items-center gap-1 sm:gap-1.5 truncate">
                {isActive ? (
                  <>
                    <span
                      className={cn(
                        "bg-gradient-to-r bg-clip-text text-transparent font-semibold",
                        isCodeMode
                          ? "from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400"
                          : "from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400",
                      )}
                    >
                      {isCodeMode ? "Generating Code" : "Thinking"}
                    </span>
                    <m.span
                      className={cn(
                        isCodeMode
                          ? "text-amber-600/60 dark:text-amber-400/60"
                          : "text-violet-600/60 dark:text-violet-400/60",
                      )}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      ...
                    </m.span>
                    {elapsed > 0 && (
                      <span className="text-slate-500 dark:text-muted-foreground/40 ml-0.5 font-normal">
                        {elapsed}s
                      </span>
                    )}
                  </>
                ) : displayDuration !== null ? (
                  <span className="text-slate-500 dark:text-muted-foreground/60">
                    {isCodeMode ? "Code generated in" : "Thought for"}{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        isCodeMode
                          ? "text-amber-600 dark:text-amber-400/80"
                          : "text-violet-600 dark:text-violet-400/80",
                      )}
                    >
                      {displayDuration}s
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-muted-foreground/60">
                    {isCodeMode ? "Code generated" : "Thought process"}
                  </span>
                )}
              </span>
            </div>
          </AccordionTrigger>

          <AccordionContent className="pb-2 sm:pb-3 px-2.5 sm:px-3.5">
            <div className="relative rounded-md sm:rounded-lg bg-slate-100 dark:bg-foreground/[0.02] border border-slate-200 dark:border-border/20 overflow-hidden">
              <div className="max-h-40 sm:max-h-60 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
                <MarkdownRenderer
                  content={cleanedText}
                  className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground/70 [&_p]:text-[10px] sm:[&_p]:text-xs [&_p]:text-slate-600 dark:[&_p]:text-muted-foreground/70 [&_code]:text-[9px] sm:[&_code]:text-[11px] [&_pre]:my-1.5 sm:[&_pre]:my-2 [&_pre]:rounded-lg [&_h1]:text-xs sm:[&_h1]:text-sm [&_h2]:text-xs sm:[&_h2]:text-sm [&_h3]:text-[10px] sm:[&_h3]:text-xs [&_ul]:text-[10px] sm:[&_ul]:text-xs [&_ol]:text-[10px] sm:[&_ol]:text-xs"
                />
                {isActive && (
                  <m.span
                    className={cn(
                      "inline-block w-[3px] h-2.5 sm:h-3 ml-0.5 align-text-bottom rounded-full",
                      isCodeMode
                        ? "bg-amber-500 dark:bg-amber-400/50"
                        : "bg-violet-500 dark:bg-violet-400/50",
                    )}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </div>

              {!isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-4 sm:h-6 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent, hsl(var(--background) / 0.8))",
                  }}
                />
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </m.div>
  );
});
