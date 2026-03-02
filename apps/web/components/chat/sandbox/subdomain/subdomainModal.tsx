"use client";

import { useId } from "react";
import { m } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Globe,
  LoaderIcon,
  XCircle,
  XIcon,
} from "lucide-react";
import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@edward/ui/components/dialog";
import { cn } from "@edward/ui/lib/utils";
import {
  useSubdomainAvailability,
  type AvailabilityState,
} from "@/components/chat/sandbox/subdomain/useSubdomainAvailability";

interface SubdomainModalProps {
  open: boolean;
  onClose: () => void;
  chatId: string;
  currentSubdomain: string;
  suffix: string;
  onSaved: (newUrl: string) => void;
}

function StatusIcon({
  isChecking,
  availability,
}: {
  isChecking: boolean;
  availability: AvailabilityState;
}) {
  if (isChecking) {
    return <LoaderIcon className="h-3.5 w-3.5 animate-spin text-workspace-foreground/35" />;
  }
  if (availability.status === "available") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (availability.status === "taken") {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
  if (availability.status === "format_error") {
    return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
  }
  return null;
}

function PreviewUrlSection({
  previewUrl,
  isPreviewAvailable,
}: {
  previewUrl: string;
  isPreviewAvailable: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-workspace-foreground/40">
        Preview URL
      </p>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-workspace-border/50 bg-workspace-bg/40 px-3 py-2.5 transition-all duration-300",
          isPreviewAvailable && "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/[0.07]",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[12px] transition-colors duration-200",
            isPreviewAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-workspace-foreground/50",
          )}
        >
          {previewUrl}
        </span>
        {isPreviewAvailable && (
          <m.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500"
          >
            Available
          </m.span>
        )}
      </div>
    </div>
  );
}

export function SubdomainModal({
  open,
  onClose,
  chatId,
  currentSubdomain,
  suffix,
  onSaved,
}: SubdomainModalProps) {
  const inputId = useId();
  const {
    inputRef,
    value,
    availability,
    isSaving,
    canSave,
    previewUrl,
    isPreviewAvailable,
    isChecking,
    borderColor,
    glowColor,
    statusMessage,
    saveError,
    handleChange,
    handleInputKeyDown,
    saveSubdomain,
  } = useSubdomainAvailability({
    open,
    chatId,
    currentSubdomain,
    suffix,
    onClose,
    onSaved,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[460px] gap-0 overflow-hidden rounded-xl border-workspace-border bg-workspace-sidebar p-0 shadow-2xl"
      >
        <DialogDescription className="sr-only">
          Update the custom subdomain used for this preview URL.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-workspace-border/60 px-5 py-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-workspace-accent/10">
            <Globe className="h-3.5 w-3.5 text-workspace-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[13px] font-semibold text-workspace-foreground">
              Custom preview domain
            </DialogTitle>
            <p className="mt-0.5 truncate text-[11px] text-workspace-foreground/45">
              {currentSubdomain}
              {suffix}
            </p>
          </div>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close"
            variant="ghost"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-workspace-foreground/40 transition-colors hover:bg-workspace-hover hover:text-workspace-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-workspace-accent/50"
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label
              htmlFor={inputId}
              className="text-[11px] font-medium uppercase tracking-wider text-workspace-foreground/40"
            >
              New subdomain
            </label>
            <div
              className={cn(
                "flex h-10 items-center rounded-lg border bg-workspace-bg/60 px-3 transition-all duration-150",
                borderColor,
                glowColor,
              )}
            >
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleInputKeyDown}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                disabled={isSaving}
                maxLength={63}
                placeholder={currentSubdomain}
                aria-label="New subdomain"
                className={cn(
                  "min-w-0 flex-1 bg-transparent font-mono text-[13px] text-workspace-foreground outline-none placeholder:text-workspace-foreground/25",
                  isSaving && "cursor-not-allowed opacity-50",
                )}
              />
              <span className="ml-0.5 shrink-0 select-none font-mono text-[13px] text-workspace-foreground/35">
                {suffix}
              </span>
              <span className="ml-3 flex h-5 w-5 shrink-0 items-center justify-center">
                <StatusIcon isChecking={isChecking} availability={availability} />
              </span>
            </div>

            <m.div
              animate={{ height: statusMessage ? "auto" : 0, opacity: statusMessage ? 1 : 0 }}
              initial={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {statusMessage && (
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    saveError || availability.status === "taken"
                      ? "text-destructive/80"
                      : "text-amber-500/90",
                  )}
                >
                  {statusMessage}
                </p>
              )}
            </m.div>
          </div>

          <PreviewUrlSection
            previewUrl={previewUrl}
            isPreviewAvailable={isPreviewAvailable}
          />
        </div>

        <div className="flex items-center justify-between border-t border-workspace-border/60 px-5 py-3.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
            className="text-[12px] font-medium text-workspace-foreground/50 transition-colors hover:text-workspace-foreground/80 disabled:pointer-events-none"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={() => void saveSubdomain()}
            disabled={!canSave}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold transition-all duration-150",
              canSave
                ? "bg-workspace-foreground text-workspace-bg shadow-sm hover:opacity-85 active:scale-[0.98]"
                : "cursor-not-allowed bg-workspace-foreground/8 text-workspace-foreground/30",
            )}
          >
            {isSaving ? (
              <>
                <LoaderIcon className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Update domain
                <ArrowRight className="h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
