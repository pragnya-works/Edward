import { Card, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 md:px-6">
      <div className="mb-12 flex flex-col items-start gap-4 text-center md:items-center">
        <Skeleton className="h-10 w-64 md:h-14 md:w-96" />
        <Skeleton className="h-6 w-full max-w-[700px] md:h-7" />
      </div>

      <div className="grid gap-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-6">
              <div className="space-y-2 w-full">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-3/4" />
              </div>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
