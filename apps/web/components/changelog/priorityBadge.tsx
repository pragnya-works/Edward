import { Badge } from "@edward/ui/components/badge";
import { cn } from "@edward/ui/lib/utils";
import { AlertTriangle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import { memo } from "react";

interface PriorityBadgeProps {
  priority: number;
  label: string;
}

const priorityConfig: Record<number, { icon: React.ReactNode; className: string; showLabel: boolean }> = {
  1: {
    icon: <AlertTriangle className="w-3 h-3" />,
    className: "text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50 dark:border-rose-800/30",
    showLabel: true,
  },
  2: {
    icon: <ArrowUp className="w-3 h-3" />,
    className: "text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20 border-orange-200/50 dark:border-orange-800/30",
    showLabel: false,
  },
  3: {
    icon: <ArrowRight className="w-3 h-3" />,
    className: "text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30",
    showLabel: false,
  },
  4: {
    icon: <ArrowDown className="w-3 h-3" />,
    className: "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-800/30",
    showLabel: false,
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
        "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium",
        "border rounded-md",
        config.className
      )}
      title={label}
    >
      {config.icon}
      {config.showLabel && <span>{label}</span>}
    </Badge>
  );
}

export const PriorityBadge = memo(PriorityBadgeComponent);
PriorityBadge.displayName = "PriorityBadge";
