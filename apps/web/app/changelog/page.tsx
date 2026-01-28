import { Metadata } from "next";
import { Suspense } from "react";
import { getLinearIssues, groupAndSortIssues, ChangelogIssue } from "@/lib/linear";
import { ChangelogHeader } from "@/components/changelog/header";
import { IssueCard, IssueCardSkeleton } from "@/components/changelog/issueCard";
import { AlertCircle, FolderGit } from "lucide-react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Changelog",
  description: "Stay up to date with the latest improvements, features, and fixes we've shipped.",
};

function ChangelogSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <IssueCardSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-destructive/70" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">
        Unable to Load Changelog
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error === "Missing LINEAR_API_KEY environment variable"
          ? "Please configure the LINEAR_API_KEY environment variable."
          : "There was an error connecting to Linear. Please try again later."}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <FolderGit className="w-6 h-6 text-muted-foreground/50" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">No Updates Yet</h3>
      <p className="text-sm text-muted-foreground">
        Check back soon for new features and improvements.
      </p>
    </div>
  );
}

interface CategorySectionProps {
  label: string;
  issues: ChangelogIssue[];
  startIndex: number;
}

function CategorySection({ label, issues, startIndex }: CategorySectionProps) {
  return (
    <section className="mb-10 last:mb-0">
      <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border/30">
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground/60 tabular-nums">{issues.length}</span>
      </div>
      <div className="space-y-0">
        {issues.map((issue, idx) => (
          <IssueCard key={issue.id} issue={issue} index={startIndex + idx} />
        ))}
      </div>
    </section>
  );
}

async function ChangelogContent() {
  const { issues, error } = await getLinearIssues();

  if (error) return <ErrorState error={error} />;
  if (issues.length === 0) return <EmptyState />;

  const { categorizedIssues, sortedLabels } = groupAndSortIssues(issues);
  let globalIndex = 0;

  return (
    <div className="space-y-0">
      {sortedLabels.map((label) => {
        const categoryIssues = categorizedIssues[label];
        if (!categoryIssues?.length) return null;

        const section = (
          <CategorySection
            key={label}
            label={label}
            issues={categoryIssues}
            startIndex={globalIndex}
          />
        );

        globalIndex += categoryIssues.length;
        return section;
      })}
    </div>
  );
}

export default function ChangelogPage() {
  return (
    <main>
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <ChangelogHeader />
        
        <Suspense fallback={<ChangelogSkeleton />}>
          <ChangelogContent />
        </Suspense>
      </div>
    </main>
  );
}
