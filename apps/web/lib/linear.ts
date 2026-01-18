import { LinearClient, PaginationOrderBy } from "@linear/sdk";

export interface ChangelogIssue {
  id: string;
  identifier: string;
  title: string;
  updatedAt: Date;
  completedAt?: Date;
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

export async function getLinearIssues(): Promise<FetchIssuesResult> {
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
        state: {
          type: { neq: "completed" },
        },
        number: { gt: 5 },
      },
      includeArchived: true,
    });

    const formattedIssues = await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          updatedAt: issue.updatedAt,
          completedAt: issue.completedAt ?? undefined,
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
}
