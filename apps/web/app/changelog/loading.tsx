import { Skeleton } from "@workspace/ui/components/skeleton";
import { IssueCardSkeleton } from "@/components/changelog/issueCard";

export default function Loading() {
  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 md:px-8">
      <div className="mb-12 flex flex-col items-center gap-4 text-center">
        <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
        <Skeleton className="h-4 w-full max-w-lg md:h-5 md:w-125" />
      </div>

      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <IssueCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
