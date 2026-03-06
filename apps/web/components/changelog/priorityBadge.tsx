import { Badge } from "@edward/ui/components/badge";
import { cn } from "@edward/ui/lib/utils";
import { memo } from "react";

interface PriorityBadgeProps {
  priority: number;
  label: string;
}

const priorityConfig: Record<number, { className: string }> = {
  1: {
    className: "text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/20 border-rose-300/70 dark:border-rose-800/30",
  },
  2: {
    className: "text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/20 border-orange-300/70 dark:border-orange-800/30",
  },
  3: {
    className: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-800/30",
  },
  4: {
    className: "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/20 border-blue-300/70 dark:border-blue-800/30",
  },
};

function PriorityBadgeComponent({ priority, label }: PriorityBadgeProps) {
  if (priority === 0) return null;

  const config = priorityConfig[priority];
  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0.5 text-[10px] font-medium cursor-default",
        "border rounded-md",
        config.className,
      )}
    >
      <span>{label}</span>
    </Badge>
  );
}

export const PriorityBadge = memo(PriorityBadgeComponent);
PriorityBadge.displayName = "PriorityBadge";
