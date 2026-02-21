"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { cn } from "@edward/ui/lib/utils";
import { checkSubdomainAvailability, updateChatSubdomain } from "@/lib/api";
import { Button } from "@edward/ui/components/button";
import { toast } from "@edward/ui/components/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@edward/ui/components/dialog";

const SUBDOMAIN_RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "dashboard",
  "ftp",
  "dev",
  "smtp",
  "staging",
  "preview",
  "static",
  "assets",
  "cdn",
  "media",
  "files",
  "storage",
]);

const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const AVAILABILITY_DEBOUNCE_MS = 380;

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; reason: string }
  | { status: "format_error"; reason: string };

interface SubdomainModalProps {
  open: boolean;
  onClose: () => void;
  chatId: string;
  currentSubdomain: string;
  suffix: string;
  onSaved: (newUrl: string) => void;
}

function validateSubdomainClient(value: string): string | null {
  if (!value || value.length === 0) return null;
  if (value.length < 3) return "At least 3 characters required";
  if (value.length > 63) return "63 characters max";
  if (!SUBDOMAIN_REGEX.test(value)) {
    if (value.startsWith("-") || value.endsWith("-")) {
      return "Cannot start or end with a hyphen";
    }
    return "Lowercase letters, numbers, and hyphens only";
  }
  if (SUBDOMAIN_RESERVED.has(value)) return `"${value}" is reserved`;
  return null;
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

function SubdomainModalHeader({
  currentSubdomain,
  suffix,
  onClose,
}: {
  currentSubdomain: string;
  suffix: string;
  onClose: () => void;
}) {
  return (
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
  );
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
          isPreviewAvailable && "border-emerald-500/20 bg-emerald-500/[0.03]",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[12px] transition-colors duration-200",
            isPreviewAvailable ? "text-emerald-400" : "text-workspace-foreground/50",
          )}
        >
          {previewUrl}
        </span>
        {isPreviewAvailable && (
          <m.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-500"
          >
            Available
          </m.span>
        )}
      </div>
    </div>
  );
}

function FooterActions({
  canSave,
  isSaving,
  onClose,
  onSave,
}: {
  canSave: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
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
        onClick={onSave}
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef(0);

  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityState>({ status: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const value = draftValue ?? currentSubdomain;

  useEffect(() => {
    if (!open) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      return;
    }

    setDraftValue(null);
    setAvailability({ status: "idle" });
    setIsSaving(false);
    setSaveError(null);

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      activeRequestControllerRef.current?.abort();
      debounceRef.current = null;
      activeRequestControllerRef.current = null;
    };
  }, [open, currentSubdomain]);

  const runAvailabilityCheck = useCallback(
    async (subdomain: string, requestId: number, signal: AbortSignal) => {
      try {
        const response = await checkSubdomainAvailability(subdomain, chatId, signal);
        if (signal.aborted || latestRequestIdRef.current !== requestId) return;
        setAvailability(
          response.data.available
            ? { status: "available" }
            : { status: "taken", reason: response.data.reason ?? "Already taken" },
        );
      } catch {
        if (signal.aborted || latestRequestIdRef.current !== requestId) return;
        setAvailability({
          status: "taken",
          reason: "Could not verify - check your connection",
        });
      }
    },
    [chatId],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
      setDraftValue(raw);
      setSaveError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      activeRequestControllerRef.current?.abort();

      if (!raw || raw === currentSubdomain) {
        setAvailability({ status: "idle" });
        return;
      }

      const formatError = validateSubdomainClient(raw);
      if (formatError) {
        setAvailability({ status: "format_error", reason: formatError });
        return;
      }

      setAvailability({ status: "checking" });
      debounceRef.current = setTimeout(() => {
        latestRequestIdRef.current += 1;
        const requestId = latestRequestIdRef.current;
        const controller = new AbortController();
        activeRequestControllerRef.current = controller;
        void runAvailabilityCheck(raw, requestId, controller.signal);
      }, AVAILABILITY_DEBOUNCE_MS);
    },
    [currentSubdomain, runAvailabilityCheck],
  );

  const canSave =
    !isSaving &&
    value.length >= 3 &&
    value !== currentSubdomain &&
    availability.status === "available";

  const saveSubdomain = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await updateChatSubdomain(chatId, value);
      onClose();
      onSaved(response.data.previewUrl);
      toast.success("Subdomain updated", {
        description: `${response.data.subdomain}${suffix}`,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save. Please try again.",
      );
      setIsSaving(false);
    }
  }, [canSave, chatId, onClose, onSaved, suffix, value]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void saveSubdomain();
    },
    [saveSubdomain],
  );

  const previewUrl = value
    ? `https://${value}${suffix}`
    : `https://${currentSubdomain}${suffix}`;
  const isPreviewAvailable = availability.status === "available";
  const isChecking = availability.status === "checking" || isSaving;

  const borderColor =
    availability.status === "taken"
      ? "border-destructive/50"
      : availability.status === "format_error"
        ? "border-amber-500/40"
        : availability.status === "available"
          ? "border-emerald-500/50"
          : "border-workspace-border";

  const glowColor =
    availability.status === "available"
      ? "shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
      : availability.status === "taken" || availability.status === "format_error"
        ? "shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
        : "";

  const statusMessage =
    saveError ??
    (availability.status === "taken" || availability.status === "format_error"
      ? availability.reason
      : null);

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

        <SubdomainModalHeader
          currentSubdomain={currentSubdomain}
          suffix={suffix}
          onClose={onClose}
        />

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

        <FooterActions
          canSave={canSave}
          isSaving={isSaving}
          onClose={onClose}
          onSave={() => void saveSubdomain()}
        />
      </DialogContent>
    </Dialog>
  );
}
