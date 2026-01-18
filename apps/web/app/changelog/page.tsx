import { getLinearIssues } from "@/lib/linear";
import { ChangelogHeader } from "@/components/changelog/header";
import { IssueCard } from "@/components/changelog/issueCard";
import { Card, CardContent } from "@workspace/ui/components/card";
import { AlertCircle } from "lucide-react";

export const revalidate = 3600;

export default async function ChangelogPage() {
  const { issues, error } = await getLinearIssues();

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 md:px-6">
      <ChangelogHeader />

      {error ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="mb-4 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold text-destructive">Unable to Load Issues</h3>
            <p className="text-sm text-muted-foreground">
              {error === "Missing LINEAR_API_KEY environment variable"
                ? "Please configure the LINEAR_API_KEY environment variable."
                : "There was an error connecting to Linear."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {issues.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No changelog items found yet. Check back soon!
            </div>
          ) : (
            issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))
          )}
        </div>
      )}
    </div>
  );
}