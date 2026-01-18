import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Calendar } from "lucide-react";
import { StatusBadge } from "./statusBadge";
import { ChangelogIssue } from "@/lib/linear";

export function IssueCard({ issue }: { issue: ChangelogIssue }) {
  const dateToUse = issue.completedAt || issue.updatedAt;

  return (
    <Card className="group overflow-hidden border-border/50 transition-all hover:bg-muted/50 hover:border-border hover:shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{issue.identifier}</span>
            <span>•</span>
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
          </div>
          <CardTitle className="text-xl font-semibold leading-none tracking-tight group-hover:text-primary transition-colors">
            {issue.title}
          </CardTitle>
        </div>
        <StatusBadge
          name={issue.state.name}
          color={issue.state.color}
          type={issue.state.type}
        />
      </CardHeader>
    </Card>
  );
}
