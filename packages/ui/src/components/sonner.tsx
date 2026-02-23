"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import { cn } from "@edward/ui/lib/utils";

function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={cn("toaster group", className)}
      position="bottom-right"
      closeButton
      expand
      duration={4200}
      visibleToasts={4}
      gap={10}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "group toast pointer-events-auto rounded-xl border border-workspace-border text-workspace-foreground bg-workspace-sidebar shadow-[0_22px_52px_-28px_rgba(0,0,0,0.55)]",
          title:
            "text-[13px] font-semibold tracking-tight text-workspace-foreground",
          description: "text-[12px] leading-relaxed text-workspace-foreground/65",
          actionButton:
            "rounded-lg bg-workspace-foreground px-2.5 py-1.5 text-[11px] font-semibold text-workspace-bg",
          cancelButton:
            "rounded-lg border border-workspace-border bg-workspace-bg px-2.5 py-1.5 text-[11px] font-semibold text-workspace-foreground/80 hover:bg-workspace-hover",
          success:
            "!border-emerald-500 !bg-workspace-sidebar [&_[data-icon]]:text-emerald-400",
          error:
            "!border-destructive !bg-workspace-sidebar [&_[data-icon]]:text-destructive",
          info: "!border-workspace-accent !bg-workspace-sidebar [&_[data-icon]]:text-workspace-accent",
          warning:
            "!border-amber-500 !bg-workspace-sidebar [&_[data-icon]]:text-amber-500",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
