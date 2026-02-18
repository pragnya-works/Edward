"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main>
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive/70" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">Unable to Load Changelog</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            There was an error loading the changelog. Try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
