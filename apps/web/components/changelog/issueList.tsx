"use client";

import { IssueCard } from "./issueCard";
import type { ChangelogIssue } from "@/lib/linear";

interface IssueListProps {
  issues: ChangelogIssue[];
  startIndex?: number;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

export function IssueList({
  issues,
  startIndex = 0,
  expandedId,
  onToggle,
}: IssueListProps) {
  return (
    <div className="space-y-0">
      {issues.map((issue, idx) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          index={startIndex + idx}
          isExpanded={expandedId === issue.id}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
