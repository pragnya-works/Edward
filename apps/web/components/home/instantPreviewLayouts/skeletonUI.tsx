"use client";

import { memo } from "react";
import { m } from "motion/react";

export const SkeletonUI = memo(function SkeletonUI() {
  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-3">
        <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-3 w-3/4 animate-pulse rounded-md bg-muted/10" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 animate-pulse rounded-xl border border-border/20 bg-muted/5" />
        <div className="h-20 animate-pulse rounded-xl border border-border/20 bg-muted/5" />
      </div>
      <div className="relative h-24 w-full overflow-hidden rounded-xl border border-primary/10 bg-primary/5">
        <m.div
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent"
        />
      </div>
    </div>
  );
});
