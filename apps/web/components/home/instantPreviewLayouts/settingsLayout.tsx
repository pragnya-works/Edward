"use client";

import { memo } from "react";
import { m } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { layoutVariants } from "./layoutVariants";

export const SettingsLayout = memo(function SettingsLayout() {
  return (
    <div className="flex-1 space-y-5 overflow-hidden p-5 md:p-6">
      <div className="space-y-1 border-b border-border/50 pb-2">
        <h3 className="text-sm font-bold">Workspace Settings</h3>
        <p className="text-[9px] text-muted-foreground">
          Manage your organization preferences
        </p>
      </div>

      <div className="space-y-4 pt-2">
        {[1, 2, 3].map((slot) => (
          <m.div
            key={`settings-row-${slot}`}
            variants={layoutVariants.slideUp}
            initial="initial"
            animate="animate"
            transition={{ delay: slot * 0.1 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg border border-border bg-muted/30" />
              <div className="space-y-1">
                <div className="h-2 w-20 rounded bg-muted/60" />
                <div className="h-1.5 w-12 rounded bg-muted/30" />
              </div>
            </div>
            <div
              className={cn(
                "relative h-4 w-8 rounded-full border border-border",
                slot === 1 ? "bg-primary/20" : "bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all",
                  slot === 1
                    ? "right-0.5 bg-primary"
                    : "left-0.5 bg-muted-foreground/30",
                )}
              />
            </div>
          </m.div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-1.5 w-16 rounded bg-primary/20" />
        </div>
        <div className="h-4 w-12 rounded border border-primary/20 bg-primary/10" />
      </div>
    </div>
  );
});
