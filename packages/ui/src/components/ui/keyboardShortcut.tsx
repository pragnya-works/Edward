import { cn } from "@edward/ui/lib/utils";

interface KeyboardShortcutProps {
  children: React.ReactNode;
  className?: string;
}

export function KeyboardShortcut({ children, className }: KeyboardShortcutProps) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-6 select-none items-center rounded-md border border-border/70 bg-background/95 px-2 font-mono text-xs font-medium text-foreground/85",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
