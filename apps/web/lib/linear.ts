import { cache } from "react";
import { LinearClient, PaginationOrderBy } from "@linear/sdk";

export interface ChangelogIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  updatedAt: Date;
  completedAt?: Date;
  priority: number;
  priorityLabel: string;
  labels: {
    name: string;
    color: string;
  }[];
  state: {
    name: string;
    color: string;
    type: string;
  };
}

export interface FetchIssuesResult {
  issues: ChangelogIssue[];
  error: string | null;
}

export const getLinearIssues = cache(async (): Promise<FetchIssuesResult> => {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    return { issues: [], error: "Missing LINEAR_API_KEY environment variable" };
  }

  try {
    const client = new LinearClient({ apiKey });
    const issues = await client.issues({
      first: 50,
      orderBy: PaginationOrderBy.UpdatedAt,
      filter: {
        project: { name: { eq: "Edward" } },
        state: { type: { neq: "completed" } },
        number: { gt: 5 },
      },
      includeArchived: true,
    });

    const formattedIssues = await Promise.all(
      issues.nodes.map(async (issue) => {
        const [state, labels] = await Promise.all([issue.state, issue.labels()]);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? undefined,
          updatedAt: issue.updatedAt,
          completedAt: issue.completedAt ?? undefined,
          priority: issue.priority,
          priorityLabel: issue.priorityLabel,
          labels: labels.nodes.map((label) => ({
            name: label.name,
            color: label.color,
          })),
          state: {
            name: state?.name ?? "Unknown",
            color: state?.color ?? "#888888",
            type: state?.type ?? "completed",
          },
        };
      })
    );

    return { issues: formattedIssues, error: null };
  } catch (error) {
    console.error("Failed to fetch Linear issues:", error);
    return { issues: [], error: "Failed to connect to Linear API" };
  }
});

export function groupAndSortIssues(issues: ChangelogIssue[]): {
  categorizedIssues: Record<string, ChangelogIssue[]>;
  sortedLabels: string[]
} {
  const categorizedIssues = issues.reduce((acc, issue) => {
    const label = issue.labels[0]?.name || "General";
    if (!acc[label]) {
      acc[label] = [];
    }
    acc[label].push(issue);
    return acc;
  }, {} as Record<string, ChangelogIssue[]>);

  const sortedLabels = Object.keys(categorizedIssues).sort((a, b) => {
    if (a === "General") return 1;
    if (b === "General") return -1;
    return a.localeCompare(b);
  });

  sortedLabels.forEach((label) => {
    categorizedIssues[label]?.sort((a, b) => {
      const pA = a.priority === 0 ? 10 : a.priority;
      const pB = b.priority === 0 ? 10 : b.priority;
      if (pA !== pB) return pA - pB;
      const dateA = new Date(a.completedAt || a.updatedAt).getTime();
      const dateB = new Date(b.completedAt || b.updatedAt).getTime();
      return dateB - dateA;
    });
  });

  return { categorizedIssues, sortedLabels };
}

