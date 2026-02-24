"use client";

import { memo } from "react";
import { m } from "motion/react";
import { layoutVariants } from "./layoutVariants";

export const MarketingLayout = memo(function MarketingLayout() {
  return (
    <div className="flex flex-1 flex-col items-center space-y-6 overflow-hidden p-6">
      <m.div
        variants={layoutVariants.scaleUp}
        initial="initial"
        animate="animate"
        className="space-y-4 text-center"
      >
        <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[7px] font-bold uppercase tracking-widest text-emerald-500">
          New Feature
        </div>
        <h3 className="text-xl font-bold leading-[1.2] tracking-tight text-foreground">
          Design at the speed <br /> of{" "}
          <span className="text-primary underline decoration-primary/30 underline-offset-4">
            thought
          </span>
        </h3>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid w-full grid-cols-3 gap-2 px-2"
      >
        {[1, 2, 3].map((slot) => (
          <div
            key={`marketing-card-${slot}`}
            className="flex aspect-[4/5] flex-col space-y-2 rounded-lg border border-border bg-card p-2 shadow-sm"
          >
            <div className="flex-1 rounded-md bg-muted/30" />
            <div className="h-1 w-3/4 rounded bg-muted/50" />
          </div>
        ))}
      </m.div>

      <m.div
        variants={layoutVariants.fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.6 }}
        className="rounded-full bg-primary px-6 py-2 text-[9px] font-bold text-primary-foreground shadow-lg shadow-primary/20"
      >
        Join the waitlist
      </m.div>
    </div>
  );
});
