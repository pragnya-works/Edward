import { Badge } from "@workspace/ui/components/badge";
import { 
  AlertTriangle, 
  ArrowUpCircle, 
  ArrowRightCircle, 
  ArrowDownCircle, 
  Minus 
} from "lucide-react";
import React from "react";

interface PriorityBadgeProps {
  priority: number;
  label: string;
}

function PriorityIcon({ priority }: { priority: number }) {
  switch (priority) {
    case 1:
      return <AlertTriangle className="h-3 w-3 text-destructive" />;
    case 2:
      return <ArrowUpCircle className="h-3 w-3 text-orange-500" />;
    case 3:
      return <ArrowRightCircle className="h-3 w-3 text-yellow-500" />;
    case 4:
      return <ArrowDownCircle className="h-3 w-3 text-blue-500" />;
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

export function PriorityBadge({ priority, label }: PriorityBadgeProps) {
  if (priority === 0) return null;

  return (
    <Badge
      variant="outline"
      className="flex shrink-0 items-center gap-1.5 border-border/50 bg-secondary/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
    >
      <PriorityIcon priority={priority} />
      {label}
    </Badge>
  );
}
