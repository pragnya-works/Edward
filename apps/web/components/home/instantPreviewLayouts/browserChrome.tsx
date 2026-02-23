"use client";

import { memo } from "react";
import { cn } from "@edward/ui/lib/utils";

export const BrowserHeader = memo(function BrowserHeader() {
  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/10 px-4 py-3">
      <div className="flex gap-1.5">
        <div className="h-2 w-2 rounded-full border border-red-400/30 bg-red-400/20" />
        <div className="h-2 w-2 rounded-full border border-yellow-400/30 bg-yellow-400/20" />
        <div className="h-2 w-2 rounded-full border border-green-400/30 bg-green-400/20" />
      </div>
      <div className="h-2 w-32 rounded-full border border-border/50 bg-muted-foreground/10" />
      <div className="w-8" />
    </div>
  );
});

export const Sidebar = memo(function Sidebar() {
  return (
    <div className="w-10 shrink-0 space-y-4 border-r border-border bg-muted/5 p-3 md:w-12">
      {[1, 2, 3, 4].map((slot) => (
        <div
          key={`sidebar-segment-${slot}`}
          className={cn(
            "h-1.5 w-full rounded-full",
            slot === 1 ? "bg-primary/20" : "bg-muted-foreground/10",
          )}
        />
      ))}
    </div>
  );
});
