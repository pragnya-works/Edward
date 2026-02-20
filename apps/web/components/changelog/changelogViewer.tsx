"use client";

import { useState, useCallback } from "react";
import { IssueList } from "./issueList";
import type { ChangelogIssue } from "@/lib/linear";

interface ChangelogViewerProps {
  categorizedIssues: Record<string, ChangelogIssue[]>;
  sortedLabels: string[];
}

export function ChangelogViewer({ categorizedIssues, sortedLabels }: ChangelogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  let globalIndex = 0;

  return (
    <div className="space-y-0">
      {sortedLabels.map((label) => {
        const issues = categorizedIssues[label];
        if (!issues?.length) return null;

        const startIndex = globalIndex;
        globalIndex += issues.length;

        return (
          <section key={label} className="mb-10 last:mb-0">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-slate-200/80 dark:border-border/30">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-foreground/90 uppercase tracking-wider">
                {label}
              </h2>
              <span className="text-xs text-slate-500 dark:text-muted-foreground/60 tabular-nums">{issues.length}</span>
            </div>
            <div className="space-y-0">
              <IssueList
                issues={issues}
                startIndex={startIndex}
                expandedId={expandedId}
                onToggle={handleToggle}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
