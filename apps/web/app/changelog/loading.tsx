import { Skeleton } from "@workspace/ui/components/skeleton";
import { IssueCardSkeleton } from "@/components/changelog/issueCard";

export default function Loading() {
  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 md:px-6">
      <div className="mb-12 flex flex-col items-start gap-4 text-center md:items-center">
        <Skeleton className="h-10 w-64 md:h-14 md:w-96" />
        <Skeleton className="h-6 w-full max-w-[700px] md:h-7" />
      </div>

      <div className="grid gap-6">
        {[...Array(3)].map((_, i) => (
          <IssueCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
