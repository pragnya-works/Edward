"use client";

import { memo } from "react";
import { m } from "motion/react";
import { layoutVariants } from "./layoutVariants";

export const KanbanLayout = memo(function KanbanLayout() {
  return (
    <div className="flex-1 space-y-5 overflow-hidden p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold md:text-sm">Project Sprint</h3>
        <div className="-space-x-2 flex">
          {[1, 2, 3].map((slot) => (
            <div
              key={`kanban-avatar-${slot}`}
              className="h-5 w-5 rounded-full border border-background bg-muted"
            />
          ))}
        </div>
      </div>

      <div className="flex h-full gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">
              In Progress
            </span>
          </div>
          {[1, 2].map((slot) => (
            <m.div
              key={`kanban-task-${slot}`}
              variants={layoutVariants.slideRight}
              initial="initial"
              animate="animate"
              transition={{ delay: slot * 0.1 }}
              className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="h-1 w-full rounded bg-muted/50" />
              <div className="h-1 w-2/3 rounded bg-muted/30" />
              <div className="flex items-center justify-between pt-1">
                <div className="h-3 w-8 rounded border border-primary/20 bg-primary/10" />
                <div className="h-3 w-3 rounded-full bg-muted" />
              </div>
            </m.div>
          ))}
        </div>

        <div className="flex-1 space-y-3 opacity-40">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">
              Done
            </span>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="h-1 w-full rounded bg-muted/50" />
            <div className="h-3 w-8 rounded bg-emerald-500/10" />
          </div>
        </div>
      </div>
    </div>
  );
});
