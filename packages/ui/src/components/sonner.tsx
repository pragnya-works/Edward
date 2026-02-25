"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";

function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  const { theme = "system", resolvedTheme } = useTheme();
  const sonnerTheme =
    theme === "system"
      ? (resolvedTheme as ToasterProps["theme"] | undefined) || "dark"
      : (theme as ToasterProps["theme"]);

  return (
    <Sonner
      theme={sonnerTheme}
      className={cn("toaster group", className)}
      position="bottom-right"
      richColors={false}
      closeButton
      expand
      duration={4200}
      visibleToasts={4}
      gap={10}
      offset={20}
      mobileOffset={14}
      icons={{
        success: <CheckCircle2 className="size-4" />,
        error: <CircleX className="size-4" />,
        warning: <CircleAlert className="size-4" />,
        info: <Info className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
        close: <X className="size-3.5" />,
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "ed-toast group pointer-events-auto select-none rounded-2xl border shadow-none",
          content: "ed-toast__content",
          icon: "ed-toast__icon",
          title: "ed-toast__title",
          description: "ed-toast__description",
          closeButton: "ed-toast__close",
          actionButton: "ed-toast__action",
          cancelButton: "ed-toast__cancel",
          success: "ed-toast--success",
          error: "ed-toast--error",
          info: "ed-toast--info",
          warning: "ed-toast--warning",
          loading: "ed-toast--loading",
          default: "ed-toast--default",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
