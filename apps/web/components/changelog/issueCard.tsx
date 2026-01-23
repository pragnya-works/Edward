import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Calendar } from "lucide-react";
import { StatusBadge } from "./statusBadge";
import { PriorityBadge } from "./priorityBadge";
import { ChangelogIssue } from "@/lib/linear";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function IssueCard({ issue }: { issue: ChangelogIssue }) {
  const dateToUse = issue.completedAt || issue.updatedAt;

  return (
    <Card className="group overflow-hidden border-border/50 transition-all bg-card/50 hover:bg-muted/50 hover:border-border hover:shadow-sm">
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

          <CardTitle className="text-lg md:text-xl font-semibold leading-tight tracking-tight group-hover:text-primary transition-colors">
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
    </Card>
  );
}

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