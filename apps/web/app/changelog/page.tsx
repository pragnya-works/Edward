import { Metadata } from "next";
import { Suspense, type ComponentType, type ReactNode } from "react";
import {
  LinearFetchError,
  getLinearIssues,
  sortIssues,
} from "@/lib/linear";
import { ChangelogHeader } from "@/components/changelog/header";
import { IssueCardSkeleton } from "@/components/changelog/issueCard";
import { ChangelogViewer } from "@/components/changelog/changelogViewer";
import { ChangelogMetrics } from "@/components/changelog/metrics";
import { AlertCircle, CheckCircle2, FolderGit, Hammer } from "lucide-react";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";

export const revalidate = 3600;
const changelogCanonicalUrl = getCanonicalUrl("/changelog");

export const metadata: Metadata = {
  title: "Changelog",
  description: "Stay up to date with the latest improvements, features, and fixes we've shipped.",
  alternates: {
    canonical: "/changelog",
  },
  openGraph: {
    url: changelogCanonicalUrl ?? undefined,
    images: [STATIC_OG_IMAGE_URL],
  },
  twitter: {
    title: "Changelog | Edward",
    description: "Stay up to date with the latest improvements, features, and fixes we've shipped.",
    images: [STATIC_OG_IMAGE_URL],
  },
};

function ChangelogSkeleton() {
  return (
    <div className="space-y-0">
      {["one", "two", "three", "four", "five"].map((slot, index) => (
        <IssueCardSkeleton key={slot} index={index} />
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: LinearFetchError }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-destructive/70" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">
        Unable to Load Changelog
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error === LinearFetchError.MISSING_API_KEY
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

function ChangelogSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 dark:border-border/40 dark:bg-muted/30">
          <Icon className="h-4 w-4 text-slate-700 dark:text-foreground/80" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

async function ChangelogContent() {
  const { issues, error } = await getLinearIssues();

  if (error) return <ErrorState error={error} />;
  if (issues.length === 0) return <EmptyState />;

  const inProgressIssues: typeof issues = [];
  const doneIssues: typeof issues = [];

  for (const issue of issues) {
    const stateName = issue.state.name.toLowerCase();
    const isBacklog = issue.state.type === "backlog" || stateName === "backlog";

    if (issue.state.type === "completed") {
      doneIssues.push(issue);
      continue;
    }

    if (!isBacklog) {
      inProgressIssues.push(issue);
    }
  }

  if (inProgressIssues.length === 0 && doneIssues.length === 0) {
    return <EmptyState />;
  }

  const sortedInProgress = inProgressIssues.length ? sortIssues(inProgressIssues) : null;
  const sortedDone = doneIssues.length ? sortIssues(doneIssues) : null;

  return (
    <div className="space-y-10 md:space-y-16">
      <ChangelogMetrics issues={issues} />

      {sortedInProgress ? (
        <ChangelogSection
          title="What we're building"
          description="Features, improvements, and fixes currently in motion."
          icon={Hammer}
        >
          <ChangelogViewer issues={sortedInProgress} />
        </ChangelogSection>
      ) : null}

      {sortedDone ? (
        <ChangelogSection
          title="What's done"
          description="Recent work that has already shipped."
          icon={CheckCircle2}
        >
          <ChangelogViewer issues={sortedDone} />
        </ChangelogSection>
      ) : null}
    </div>
  );
}

export default function ChangelogPage() {
  return (
    <main className="min-h-[100dvh] text-foreground">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <ChangelogHeader />

        <Suspense fallback={<ChangelogSkeleton />}>
          <ChangelogContent />
        </Suspense>
      </div>
    </main>
  );
}
