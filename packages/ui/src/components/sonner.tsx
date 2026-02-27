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
      expand={false}
      duration={3200}
      visibleToasts={3}
      gap={8}
      offset={20}
      mobileOffset={12}
      icons={{
        success: <CheckCircle2 className="size-[18px]" />,
        error: <CircleX className="size-[18px]" />,
        warning: <CircleAlert className="size-[18px]" />,
        info: <Info className="size-[18px]" />,
        loading: <Loader2 className="size-[18px] animate-spin" />,
        close: <X className="size-4" />,
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "ed-toast group relative overflow-hidden pointer-events-auto select-none rounded-[18px] shadow-none",
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
