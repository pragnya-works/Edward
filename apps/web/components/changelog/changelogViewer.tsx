"use client";

import { useState, useCallback, memo } from "react";
import { IssueList } from "./issueList";
import type { ChangelogIssue } from "@/lib/linear";

interface ChangelogViewerProps {
  issues: ChangelogIssue[];
}

export const ChangelogViewer = memo(function ChangelogViewer({ issues }: ChangelogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-0 mt-4">
      <IssueList
        issues={issues}
        expandedId={expandedId}
        onToggle={handleToggle}
      />
    </div>
  );
});
