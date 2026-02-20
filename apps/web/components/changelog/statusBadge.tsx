import { Badge } from "@edward/ui/components/badge";
import { cn } from "@edward/ui/lib/utils";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { memo } from "react";

interface StatusBadgeProps {
  name: string;
  color: string;
  type: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  completed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: "text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/20 border-emerald-300/70 dark:border-emerald-800/30",
  },
  started: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    className: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-800/30",
  },
  canceled: {
    icon: <XCircle className="w-3 h-3" />,
    className: "text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/20 border-rose-300/70 dark:border-rose-800/30",
  },
  default: {
    icon: <Circle className="w-3 h-3" />,
    className: "text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-950/20 border-slate-300/70 dark:border-slate-800/30",
  },
};

function StatusBadgeComponent({ name, type }: StatusBadgeProps) {
  const config = statusConfig[type] ?? statusConfig.default;

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium capitalize",
        "border rounded-md transition-colors",
        config!.className
      )}
    >
      {config!.icon}
      <span className="sr-only">Status:</span>
      {name}
    </Badge>
  );
}

export const StatusBadge = memo(StatusBadgeComponent);
StatusBadge.displayName = "StatusBadge";
