"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { copyTextToClipboard } from "../lib/clipboard";

interface CopyButtonProps {
  content: string;
  className?: string;
  onCopySuccess?: () => void | Promise<void>;
}

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      content,
      className = "",
      onCopySuccess,
    }: CopyButtonProps,
    ref,
  ) => {
    const [isCopied, setIsCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reducedMotion = useReducedMotion();

    const clearCopyTimeout = () => {
      if (timeoutRef.current === null) {
        return;
      }

      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };

    useEffect(
      () => () => {
        if (timeoutRef.current === null) {
          return;
        }

        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      },
      [],
    );

    const copyToClipboard = async () => {
      const copied = await copyTextToClipboard(content);
      if (!copied) return;

      setIsCopied(true);
      try {
        await onCopySuccess?.();
      } catch (error) {
        console.error("CopyButton onCopySuccess callback failed", error);
      }

      clearCopyTimeout();
      timeoutRef.current = setTimeout(() => {
        setIsCopied(false);
        timeoutRef.current = null;
      }, 2000);
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={copyToClipboard}
        aria-label={isCopied ? "Copied" : "Copy code"}
        className={`flex items-center justify-center p-1.5 rounded-md hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.1] text-muted-foreground/60 hover:text-foreground transition-all duration-200 ${className}`}
        title="Copy code"
      >
        {reducedMotion ? (
          isCopied ? (
            <Check key="check" className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy key="copy" className="w-3.5 h-3.5" />
          )
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {isCopied ? (
              <m.div
                key="check"
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              </m.div>
            ) : (
              <m.div
                key="copy"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <Copy className="w-3.5 h-3.5" />
              </m.div>
            )}
          </AnimatePresence>
        )}
      </button>
    );
  },
);

CopyButton.displayName = "CopyButton";
