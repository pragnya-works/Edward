import { Badge } from "@edward/ui/components/badge";
import { cn } from "@edward/ui/lib/utils";
import { AlertTriangle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import { memo } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPositioner,
  TooltipContent,
} from "@edward/ui/components/tooltip";

interface PriorityBadgeProps {
  priority: number;
  label: string;
}

const priorityConfig: Record<number, { icon: React.ReactNode; className: string; showLabel: boolean }> = {
  1: {
    icon: <AlertTriangle className="w-3 h-3" />,
    className: "text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/20 border-rose-300/70 dark:border-rose-800/30",
    showLabel: true,
  },
  2: {
    icon: <ArrowUp className="w-3 h-3" />,
    className: "text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/20 border-orange-300/70 dark:border-orange-800/30",
    showLabel: false,
  },
  3: {
    icon: <ArrowRight className="w-3 h-3" />,
    className: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-800/30",
    showLabel: false,
  },
  4: {
    icon: <ArrowDown className="w-3 h-3" />,
    className: "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/20 border-blue-300/70 dark:border-blue-800/30",
    showLabel: false,
  },
};

function PriorityBadgeComponent({ priority, label }: PriorityBadgeProps) {
  if (priority === 0) return null;

  const config = priorityConfig[priority];
  if (!config) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium cursor-default",
              "border rounded-md",
              config.className,
            )}
          >
            {config.icon}
            {config.showLabel && <span>{label}</span>}
          </Badge>
        }
      />
      <TooltipPositioner side="top">
        <TooltipContent>{label}</TooltipContent>
      </TooltipPositioner>
    </Tooltip>
  );
}

export const PriorityBadge = memo(PriorityBadgeComponent);
PriorityBadge.displayName = "PriorityBadge";
