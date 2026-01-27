import { Badge } from "@edward/ui/components/badge";
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import React from "react";

interface StatusBadgeProps {
  name: string;
  color: string;
  type: string;
}

function StatusIcon({ type }: { type: string }) {
  switch (type) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3" />;
    case "started":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "canceled":
      return <AlertCircle className="h-3 w-3" />;
    default:
      return <Circle className="h-3 w-3" />;
  }
}

export function StatusBadge({ name, color, type }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="flex shrink-0 items-center gap-1.5 border-border/50 bg-secondary/50 px-3 py-1 text-xs font-medium capitalize dark:border-[--badge-border] dark:bg-[--badge-bg] dark:text-[--badge-color]"
      style={{
        ['--badge-border' as string]: color ? `${color}40` : undefined,
        ['--badge-color' as string]: color ?? undefined,
        ['--badge-bg' as string]: color ? `${color}10` : undefined,
      }}
    >
      <StatusIcon type={type} />
      {name}
    </Badge>
  );
}