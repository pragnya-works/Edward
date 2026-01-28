import { Skeleton } from "@edward/ui/components/skeleton";
import { IssueCardSkeleton } from "@/components/changelog/issueCard";

export default function Loading() {
  return (
    <main>
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="mb-12 md:mb-16 lg:mb-20">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-9 w-48 md:h-10 md:w-56 mb-3" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <IssueCardSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
