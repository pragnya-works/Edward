"use client";

import { memo } from "react";
import { m } from "motion/react";
import { layoutVariants } from "./layoutVariants";

export const DashboardLayout = memo(function DashboardLayout() {
  return (
    <div className="flex-1 space-y-5 overflow-hidden p-5 md:p-6">
      <div className="flex items-center justify-between">
        <m.div
          variants={layoutVariants.slideRight}
          initial="initial"
          animate="animate"
          className="space-y-1"
        >
          <h3 className="text-sm font-bold text-foreground md:text-base">
            Cloud Analytics
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Real-time infrastructure health
          </p>
        </m.div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        </div>
      </div>

      <m.div
        initial={{ opacity: 0, scale: 0.98, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative h-28 w-full rounded-xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-4 md:h-32"
      >
        <div className="flex h-full items-end gap-1.5 pt-8">
          {[50, 80, 45, 95, 70, 85, 60, 90, 55, 75].map((height, index) => (
            <m.div
              key={`dashboard-bar-${height}`}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{
                duration: 0.8,
                delay: 0.1 + index * 0.03,
                ease: [0.33, 1, 0.68, 1],
              }}
              className="flex-1 rounded-t-[2px] bg-primary/40"
            />
          ))}
        </div>
        <div className="absolute left-4 top-4">
          <span className="font-mono text-xl font-bold tracking-tighter text-foreground">
            $12.4k
          </span>
        </div>
      </m.div>

      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((slot) => (
          <m.div
            key={`dashboard-card-${slot}`}
            variants={layoutVariants.slideUp}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.4 + slot * 0.1 }}
            className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex gap-2">
              <div className="h-4 w-4 rounded bg-primary/20" />
              <div className="mt-1.5 h-1.5 w-12 rounded bg-muted" />
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <m.div
                initial={{ width: 0 }}
                animate={{ width: slot === 1 ? "70%" : "45%" }}
                transition={{ duration: 1, delay: 0.8 }}
                className="h-full bg-primary/60"
              />
            </div>
          </m.div>
        ))}
      </div>
    </div>
  );
});
