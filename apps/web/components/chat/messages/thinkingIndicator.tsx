"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { m } from "motion/react";
import { Brain, Zap, ChevronRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@edward/ui/components/accordion";
import { cn } from "@edward/ui/lib/utils";
import { useTimer } from "@edward/ui/hooks/useTimer";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";

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
  const [openItems, setOpenItems] = useState<string[]>(() =>
    isActive ? ["thinking"] : [],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    setOpenItems((previous) =>
      previous.includes("thinking") ? previous : ["thinking"],
    );
  }, [isActive]);

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
  const trimmedText = useMemo(() => cleanedText.trim(), [cleanedText]);

  if (!trimmedText && !isActive) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full mb-4"
    >
      <div className={cn(
        "rounded-2xl border transition-all duration-300",
        isCodeMode 
          ? "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10" 
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-800/40"
      )}>
        <Accordion
          className="w-full"
          value={openItems}
          onValueChange={setOpenItems}
        >
          <AccordionItem value="thinking" className="border-none bg-transparent">
            <AccordionTrigger
              className={cn(
                "flex items-center gap-3 py-2 w-fit text-left group cursor-pointer transition-all hover:no-underline touch-manipulation",
                "px-4",
                "rounded-t-2xl hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 data-[state=closed]:rounded-b-2xl",
                "[&>svg:last-child]:hidden",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center shrink-0">
                  {isActive ? (
                    <m.div
                      className={cn(
                        "flex items-center justify-center p-1.5 rounded-full relative z-10",
                        isCodeMode
                          ? "bg-amber-100 dark:bg-amber-500/20"
                          : "bg-zinc-100 dark:bg-zinc-800/80",
                      )}
                      animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      {isCodeMode ? (
                        <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Brain className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                      )}
                    </m.div>
                  ) : (
                    <div
                      className={cn(
                        "flex items-center justify-center p-1.5 rounded-full ring-1 ring-inset",
                        isCodeMode
                          ? "ring-amber-200 dark:ring-amber-500/40 bg-amber-50/50 dark:bg-amber-500/10"
                          : "ring-zinc-200 dark:ring-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50",
                      )}
                    >
                      {isCodeMode ? (
                        <Zap className="w-3.5 h-3.5 text-amber-500/70 dark:text-amber-400" />
                      ) : (
                        <Brain className="w-3.5 h-3.5 text-zinc-500/70 dark:text-zinc-400" />
                      )}
                    </div>
                  )}

                  {isActive && (
                    <m.div
                      className={cn(
                        "absolute inset-0 rounded-full",
                        isCodeMode
                          ? "bg-amber-400/20 dark:bg-amber-500/20"
                          : "bg-zinc-400/20 dark:bg-zinc-500/20",
                      )}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 text-[13px] font-medium tracking-tight">
                  {isActive ? (
                    <>
                      <span
                        className={cn(
                          "bg-gradient-to-r bg-clip-text text-transparent font-semibold shadow-sm",
                          isCodeMode
                            ? "from-amber-600 to-amber-500 dark:from-amber-300 dark:to-orange-300"
                            : "from-zinc-800 to-zinc-500 dark:from-zinc-100 dark:to-zinc-300",
                        )}
                      >
                        {isCodeMode ? "Generating" : "Thinking"}
                      </span>
                      <m.span
                        className={cn(
                          "w-5 inline-block text-left font-bold font-sans tracking-[0.2em]",
                          isCodeMode
                            ? "text-amber-500/70 dark:text-amber-400/70"
                            : "text-zinc-600 dark:text-zinc-400",
                        )}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        ...
                      </m.span>
                      {elapsed > 0 && (
                        <m.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-zinc-400 dark:text-zinc-500 text-xs font-normal tabular-nums ml-1"
                        >
                          {elapsed}s
                        </m.span>
                      )}
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "text-zinc-500 font-medium dark:text-zinc-300 transition-colors",
                          isCodeMode &&
                            "text-amber-600/80 dark:text-amber-400",
                        )}
                      >
                        {isCodeMode ? "Generated" : "Thought"}
                      </span>
                      {displayDuration !== null && (
                        <span className="text-zinc-400 dark:text-zinc-500 text-xs font-normal tabular-nums ml-1">
                          {displayDuration}s
                        </span>
                      )}
                    </>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400/70 transition-transform duration-200 group-data-[panel-open]:rotate-90 ml-1 opacity-0 group-hover:opacity-100" />
              </div>
            </AccordionTrigger>

            <AccordionContent className="pb-0 pt-2 px-1">
              <m.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="relative pl-5 sm:pl-7 ml-2"
              >
                <div
                  className={cn(
                    "absolute left-2 top-1 bottom-1 w-[2px] rounded-full",
                    isCodeMode
                      ? "bg-gradient-to-b from-amber-400/60 to-transparent dark:from-amber-500/40"
                      : "bg-gradient-to-b from-zinc-200 to-transparent dark:from-zinc-700/80",
                  )}
                />

                <div className="py-1 pr-4 mb-2 text-zinc-700 dark:text-zinc-300 max-h-[400px] overflow-y-auto custom-scrollbar">
                  <MarkdownRenderer
                    content={trimmedText}
                    className={cn(
                      "text-[12px] sm:text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400",
                      "[&_p]:mb-3 last:[&_p]:mb-0 [&_p]:leading-relaxed",
                      "[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-zinc-100 dark:[&_code]:bg-zinc-800/50 [&_code]:text-[11px] sm:[&_code]:text-xs [&_code]:font-medium",
                      "[&_pre]:my-3 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-zinc-200 dark:[&_pre]:border-zinc-800",
                      "[&_h1]:text-sm [&_h2]:text-[13px] [&_h3]:text-[13px] [&_ul]:mb-3 [&_ol]:mb-3",
                      isCodeMode &&
                        "[&_code]:text-amber-600 dark:[&_code]:text-amber-400 [&_code]:bg-amber-50 dark:[&_code]:bg-amber-500/10",
                    )}
                  />
                  {isActive && (
                    <m.span
                      className={cn(
                        "inline-block w-1.5 h-3 ml-1 align-baseline rounded-full blink",
                        isCodeMode
                          ? "bg-amber-500/70"
                          : "bg-zinc-400 dark:bg-zinc-500",
                      )}
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>
              </m.div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </m.div>
  );
});
