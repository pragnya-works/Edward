"use client";

import { useState, useCallback, memo, type CSSProperties } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "./statusBadge";
import { PriorityBadge } from "./priorityBadge";
import { ChangelogIssue } from "@/lib/linear";
import { Badge } from "@edward/ui/components/badge";
import { Skeleton } from "@edward/ui/components/skeleton";
import { cn } from "@edward/ui/lib/utils";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";

interface IssueCardProps {
  issue: ChangelogIssue;
  index?: number;
  isExpanded?: boolean;
  onToggle?: (id: string) => void;
}

const DATE_COLUMN_WIDTH_PX = 72;

export const IssueCard = memo(IssueCardComponent);
IssueCard.displayName = "IssueCard";

function IssueCardComponent({ issue, index = 0, isExpanded: controlledExpanded, onToggle }: IssueCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const dateToUse = issue.completedAt || issue.updatedAt;
  const hasDescription = Boolean(issue.description?.trim());

  const handleToggle = useCallback(() => {
    if (!hasDescription) return;
    if (onToggle) {
      onToggle(issue.id);
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [hasDescription, onToggle, issue.id]);

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(dateToUse));
  const descriptionMotion = prefersReducedMotion
    ? {
        initial: { height: 0, opacity: 0, filter: "none" },
        animate: { height: "auto", opacity: 1, filter: "none" },
        exit: { height: 0, opacity: 0, filter: "none" },
        transition: { duration: 0.16, ease: "easeOut" } as const,
      }
    : {
        initial: { height: 0, opacity: 0, filter: "blur(4px)" },
        animate: { height: "auto", opacity: 1, filter: "blur(0px)" },
        exit: { height: 0, opacity: 0, filter: "blur(4px)" },
        transition: {
          height: { type: "spring", stiffness: 400, damping: 35 },
          opacity: { duration: 0.25 },
          filter: { duration: 0.25 },
        },
      };
  const descriptionOffsetStyle = {
    "--issue-date-col-width": `${DATE_COLUMN_WIDTH_PX}px`,
  } as CSSProperties;

  return (
    <m.article
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.04,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={cn(
        "group relative transition-all duration-300",
        hasDescription && "cursor-pointer",
        isExpanded
          ? "rounded-2xl bg-slate-50 dark:bg-white/[0.03] backdrop-blur-xl border border-slate-200 dark:border-white/[0.08] shadow-md mb-3 mt-1"
          : "border-b border-transparent hover:border-transparent",
      )}
    >
      {!isExpanded && (
        <div className="absolute inset-0 rounded-xl border border-transparent group-hover:bg-sidebar dark:group-hover:bg-white/[0.03] group-hover:border-slate-200/60 dark:group-hover:border-white/[0.05] transition-all duration-300 pointer-events-none" />
      )}

      <button
        type="button"
        onClick={handleToggle}
        disabled={!hasDescription}
        aria-expanded={hasDescription ? isExpanded : undefined}
        aria-controls={hasDescription ? `issue-description-${issue.id}` : undefined}
        className={cn(
          "w-full text-left py-4 px-4 sm:px-5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors disabled:cursor-default relative z-10",
        )}
        data-has-desc={hasDescription}
      >
        <div className="flex items-start sm:items-center gap-3 sm:gap-5">
          <div className="text-right min-w-[52px] shrink-0 mt-0.5 sm:mt-0">
            <time
              dateTime={dateToUse.toISOString()}
              className="text-[12px] font-medium text-slate-400 dark:text-slate-500 tabular-nums tracking-wide"
            >
              {formattedDate}
            </time>
          </div>

          <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mt-1 sm:mt-0">
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      "text-[15px] font-medium leading-snug transition-colors duration-200",
                      isExpanded
                        ? "text-slate-900 dark:text-slate-100"
                        : "text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white",
                    )}
                  >
                    {issue.title}
                  </h3>
                  {(issue.labels.length > 0 || issue.priority > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {issue.priority > 0 && (
                        <PriorityBadge priority={issue.priority} label={issue.priorityLabel} />
                      )}
                      {issue.labels.map((label) => (
                        <Badge
                          key={label.name}
                          variant="outline"
                          className="px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 shadow-sm rounded-md"
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 mt-2 sm:mt-0 w-full sm:w-auto">
                  <StatusBadge
                    name={issue.state.name}
                    color={issue.state.color}
                    type={issue.state.type}
                  />
                  {hasDescription && (
                    <m.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 rounded-full transition-colors duration-200",
                        isExpanded
                          ? "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-500 group-hover:bg-slate-100 dark:group-hover:bg-white/5 group-hover:text-slate-600 dark:group-hover:text-slate-300",
                      )}
                    >
                      <ChevronDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </m.div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </button>
      <AnimatePresence initial={false}>
        {isExpanded && hasDescription && (
          <m.div
            id={`issue-description-${issue.id}`}
            initial={descriptionMotion.initial}
            animate={descriptionMotion.animate}
            exit={descriptionMotion.exit}
            transition={descriptionMotion.transition}
            className="overflow-hidden"
          >
            <div
              style={descriptionOffsetStyle}
              className="pb-5 pt-1 px-4 sm:px-5 ml-0 sm:ml-[var(--issue-date-col-width)] mt-1 text-slate-600 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none overflow-x-hidden break-words"
            >
              <MarkdownRenderer
                content={issue.description ?? ""}
                className="text-[14px] leading-relaxed"
              />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.article>
  );
}

export function IssueCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="py-4 px-3 border-b border-border/40 last:border-b-0"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-[48px] text-right shrink-0">
          <Skeleton className="h-3 w-10 ml-auto" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
          </div>
        </div>
      </div>
    </m.div>
  );
}
