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

interface IssueCardProps {
  issue: ChangelogIssue;
  index?: number;
}

function IssueCardComponent({ issue, index = 0 }: IssueCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dateToUse = issue.completedAt || issue.updatedAt;
  const hasDescription = Boolean(issue.description?.trim());

  const handleToggle = useCallback(() => {
    if (hasDescription) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasDescription]);

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
        "group relative border-b border-border/40 last:border-b-0",
        "transition-colors duration-200",
        hasDescription && "cursor-pointer hover:bg-muted/30"
      )}
    >
      {hasDescription ? (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-controls={`issue-description-${issue.id}`}
          className="w-full text-left py-4 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-end gap-1 pt-0.5 min-w-[60px]">
              <time
                dateTime={dateToUse.toISOString()}
                className="text-[11px] font-medium text-muted-foreground/60 tabular-nums"
              >
                {formattedDate}
              </time>
              {issue.priority > 0 && (
                <PriorityBadge priority={issue.priority} label={issue.priorityLabel} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      "text-[15px] font-medium leading-snug text-foreground",
                      "transition-colors duration-200",
                      hasDescription && "group-hover:text-primary"
                    )}
                  >
                    {issue.title}
                  </h3>
                  {issue.labels.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {issue.labels.slice(1).map((label) => (
                        <Badge
                          key={label.name}
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground/70 border-border/30 bg-transparent"
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
                  <m.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-muted-foreground/40"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </m.div>
                </div>
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className="py-4 px-1">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-end gap-1 pt-0.5 min-w-[60px]">
              <time
                dateTime={dateToUse.toISOString()}
                className="text-[11px] font-medium text-muted-foreground/60 tabular-nums"
              >
                {formattedDate}
              </time>
              {issue.priority > 0 && (
                <PriorityBadge priority={issue.priority} label={issue.priorityLabel} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-medium leading-snug text-foreground">
                    {issue.title}
                  </h3>
                  {issue.labels.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {issue.labels.slice(1).map((label) => (
                        <Badge
                          key={label.name}
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground/70 border-border/30 bg-transparent"
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {isExpanded && hasDescription && (
          <m.div
            id={`issue-description-${issue.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border/30 px-1 pb-4">
              <p className="text-[13px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                {issue.description}
              </p>
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
      className="py-4 px-1 border-b border-border/40 last:border-b-0"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-15 pt-0.5">
          <Skeleton className="h-3 w-10 ml-auto" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        </div>
      </div>
    </m.div>
  );
}
