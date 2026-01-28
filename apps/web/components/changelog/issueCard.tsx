"use client";

import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@edward/ui/components/card";
import { Calendar } from "lucide-react";
import { StatusBadge } from "./statusBadge";
import { PriorityBadge } from "./priorityBadge";
import { ChangelogIssue } from "@/lib/linear";
import { Badge } from "@edward/ui/components/badge";
import { Skeleton } from "@edward/ui/components/skeleton";
import { cn } from "@edward/ui/lib/utils";

interface IssueCardProps {
  issue: ChangelogIssue;
}

function IssueCardComponent({ issue }: IssueCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dateToUse = issue.completedAt || issue.updatedAt;
  const hasDescription = Boolean(issue.description?.trim());

  const handleToggle = useCallback(() => {
    if (hasDescription) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasDescription]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (hasDescription && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setIsExpanded((prev) => !prev);
      }
    },
    [hasDescription]
  );

  return (
    <Card
      className={cn(
        "group overflow-hidden border-border/50 transition-all bg-card/50",
        hasDescription && "cursor-pointer hover:bg-muted/50 hover:border-border hover:shadow-sm",
        isExpanded && "bg-muted/30 border-border shadow-sm"
      )}
      role={hasDescription ? "button" : undefined}
      aria-expanded={hasDescription ? isExpanded : undefined}
      aria-controls={hasDescription ? `issue-description-${issue.id}` : undefined}
      tabIndex={hasDescription ? 0 : undefined}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 md:p-6">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm text-muted-foreground">
            <span className="font-mono">{issue.identifier}</span>
            <span className="hidden sm:inline">•</span>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <time dateTime={dateToUse.toISOString()}>
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(dateToUse))}
              </time>
            </div>
            {issue.priority > 0 && (
              <>
                <span className="hidden sm:inline">•</span>
                <PriorityBadge priority={issue.priority} label={issue.priorityLabel} />
              </>
            )}
          </div>

          <CardTitle
            className={cn(
              "text-lg md:text-xl font-semibold leading-tight tracking-tight transition-colors",
              hasDescription && "group-hover:text-primary"
            )}
          >
            {issue.title}
          </CardTitle>

          {issue.labels.length > 1 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {issue.labels.slice(1).map((label) => (
                <Badge
                  key={label.name}
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] opacity-70 capitalize"
                  style={{
                    borderColor: `${label.color}40`,
                    color: label.color,
                    backgroundColor: `${label.color}10`,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end pt-1">
          <StatusBadge
            name={issue.state.name}
            color={issue.state.color}
            type={issue.state.type}
          />
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {isExpanded && hasDescription && (
          <motion.div
            id={`issue-description-${issue.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.25, ease: "easeInOut" },
            }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0 pb-4 px-4 md:px-6">
              <div className="border-t border-border/50 pt-4 mt-2">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {issue.description}
                </p>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export const IssueCard = memo(IssueCardComponent);
IssueCard.displayName = "IssueCard";

export function IssueCardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-6">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
        <Skeleton className="h-6 w-24" />
      </CardHeader>
    </Card>
  );
}
