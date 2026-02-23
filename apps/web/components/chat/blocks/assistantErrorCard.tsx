"use client";

import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";
import type { AssistantErrorViewModel } from "@/lib/errors/assistantError";
import { runAssistantErrorCTA } from "@/lib/errors/assistantError";

interface AssistantErrorCardProps {
  error: AssistantErrorViewModel;
  className?: string;
  onRetry?: () => boolean;
}

export function AssistantErrorCard({
  error,
  className,
  onRetry,
}: AssistantErrorCardProps) {
  const isCaution = error.severity === "caution";

  const handlePrimaryAction = useCallback(() => {
    if (onRetry && error.cta.type === "retry_generation") {
      const handled = onRetry();
      if (handled) {
        return;
      }
    }
    runAssistantErrorCTA(error.cta);
  }, [error.cta, onRetry]);

  return (
    <div
      className={cn(
        "w-full rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5 shadow-sm",
        isCaution
          ? "border-amber-300/30 bg-amber-500/[0.08]"
          : "border-destructive/30 bg-destructive/[0.08]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div
          className={cn(
            "size-7 rounded-full pb-0.5 shrink-0 flex items-center justify-center",
            isCaution ? "bg-amber-400/25" : "bg-destructive/20",
          )}
        >
          <AlertTriangle
            className={cn(
              "h-3.5 w-3.5",
              isCaution ? "text-amber-300" : "text-destructive",
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] sm:text-[13px] font-semibold tracking-tight">
            {error.title}
          </p>
          <p className="mt-1 text-[11px] sm:text-[12px] leading-relaxed text-foreground/85 break-words">
            {error.message}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handlePrimaryAction}
              className={cn(
                "h-7 rounded-md px-2.5 text-[11px] font-medium",
                isCaution
                  ? "bg-amber-400/20 text-amber-900 dark:text-amber-100 hover:bg-amber-400/30 border border-amber-300/40"
                  : "bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/40",
              )}
            >
              {error.cta.label}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
