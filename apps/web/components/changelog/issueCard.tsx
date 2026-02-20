"use client";

import { useState, useCallback, memo } from "react";
import { m, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "./statusBadge";
import { PriorityBadge } from "./priorityBadge";
import { ChangelogIssue } from "@/lib/linear";
import { Badge } from "@edward/ui/components/badge";
import { Skeleton } from "@edward/ui/components/skeleton";
import { cn } from "@edward/ui/lib/utils";
import { MarkdownRenderer } from "@/components/chat/markdownRenderer";

interface IssueCardProps {
  issue: ChangelogIssue;
  index?: number;
  isExpanded?: boolean;
  onToggle?: (id: string) => void;
}

function IssueCardComponent({ issue, index = 0, isExpanded: controlledExpanded, onToggle }: IssueCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
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

  return (
    <m.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={cn(
        "group relative transition-all duration-200",
        hasDescription && "cursor-pointer",
        isExpanded
          ? "rounded-lg bg-slate-50/85 dark:bg-muted/25 border border-slate-200/80 dark:border-border/40 mb-1"
          : "border-b border-slate-200/70 dark:border-border/40 last:border-b-0",
      )}
    >

      <button
        type="button"
        onClick={handleToggle}
        disabled={!hasDescription}
        aria-expanded={hasDescription ? isExpanded : undefined}
        aria-controls={hasDescription ? `issue-description-${issue.id}` : undefined}
        className={cn(
          "w-full text-left py-4 px-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-150 disabled:cursor-default",
          hasDescription && !isExpanded && "hover:bg-slate-50/80 dark:hover:bg-muted/30",
        )}
        data-has-desc={hasDescription}
      >
          <div className="flex items-center gap-4">
            <div className="text-right min-w-[48px] shrink-0">
              <time
                dateTime={dateToUse.toISOString()}
                className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground/50 tabular-nums"
              >
                {formattedDate}
              </time>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      "text-[14px] font-medium leading-snug transition-colors duration-150",
                      isExpanded
                        ? "text-slate-900 dark:text-foreground"
                        : "text-slate-800 dark:text-foreground/85 group-hover:text-slate-900 dark:group-hover:text-foreground",
                    )}
                  >
                    {issue.title}
                  </h3>
                  {(issue.labels.length > 1 || issue.priority > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {issue.priority > 0 && (
                        <PriorityBadge priority={issue.priority} label={issue.priorityLabel} />
                      )}
                      {issue.labels.slice(1).map((label) => (
                        <Badge
                          key={label.name}
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] font-normal text-slate-600 dark:text-muted-foreground/60 border-slate-300/70 dark:border-border/30 bg-slate-50 dark:bg-transparent"
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge
                    name={issue.state.name}
                    color={issue.state.color}
                    type={issue.state.type}
                  />
                  {hasDescription && (
                    <m.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className={cn(
                        "transition-colors duration-150",
                        isExpanded
                          ? "text-primary/70"
                          : "text-slate-400 dark:text-muted-foreground/30 group-hover:text-slate-600 dark:group-hover:text-muted-foreground/60",
                      )}
                    >
                      <ChevronDown className="w-4 h-4" />
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.18 },
            }}
            className="overflow-hidden"
          >
            <div className="pb-4 pt-0 px-3">
              <MarkdownRenderer
                content={issue.description ?? ""}
                className="text-sm"
              />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.article>
  );
}

export const IssueCard = memo(IssueCardComponent);
IssueCard.displayName = "IssueCard";

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
