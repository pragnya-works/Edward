"use client";

import { useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { toast } from "@edward/ui/components/sonner";
import { copyTextToClipboard } from "@edward/ui/lib/clipboard";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { SubdomainModal } from "@/components/chat/sandbox/subdomain/subdomainModal";
import { ensureHttpsUrl } from "@/lib/url";

function isSubdomainPreviewUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return (
      !hostname.endsWith(".cloudfront.net") && hostname.split(".").length >= 3
    );
  } catch {
    return false;
  }
}

function parseSubdomainParts(url: string | null): {
  subdomain: string;
  suffix: string;
} {
  if (!url) return { subdomain: "", suffix: "" };
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split(".");
    return {
      subdomain: parts[0] ?? "",
      suffix: "." + parts.slice(1).join("."),
    };
  } catch {
    return { subdomain: "", suffix: "" };
  }
}

function formatPreviewUrl(url: string | null): { host: string; route: string } {
  if (!url) return { host: "", route: "" };
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      route: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  } catch {
    return { host: "", route: url };
  }
}

interface SandboxPreviewBarProps {
  url: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOpenInNewTab: () => void;
  onRefresh: () => void;
}

export function SandboxPreviewBar({
  url,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onOpenInNewTab,
  onRefresh,
}: SandboxPreviewBarProps) {
  const { setPreviewUrl } = useSandbox();
  const { chatId } = useChatWorkspaceContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { host, route } = formatPreviewUrl(url);
  const canEditSubdomain = Boolean(chatId) && isSubdomainPreviewUrl(url);
  const { subdomain, suffix } = parseSubdomainParts(url);
  const copyPreviewValue = host
    ? `https://${host}${route || "/"}`
    : ensureHttpsUrl(url ?? "");

  const handleSaved = useCallback(
    (newUrl: string) => {
      setPreviewUrl(newUrl);
    },
    [setPreviewUrl],
  );

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleCopyPreviewUrl = useCallback(async () => {
    if (!copyPreviewValue) {
      return;
    }

    const copied = await copyTextToClipboard(copyPreviewValue);
    if (copied) {
      toast.success("Preview URL copied", {
        description: copyPreviewValue,
      });
      return;
    }

    toast.error("Copy failed", {
      description: "Couldn't copy preview URL. Please try again.",
    });
  }, [copyPreviewValue]);

  return (
    <>
      <div className="shrink-0 border-b border-workspace-border bg-workspace-sidebar px-2.5 py-2 md:px-3">
        <div className="relative flex h-10 items-center gap-1.5 rounded-full border border-workspace-border bg-workspace-bg px-1.5">
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Go back in preview"
              disabled={!url || !canGoBack}
              onClick={onBack}
              className="h-7 w-7 rounded-full text-workspace-foreground disabled:opacity-35 hover:bg-workspace-hover"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Go forward in preview"
              disabled={!url || !canGoForward}
              onClick={onForward}
              className="h-7 w-7 rounded-full text-workspace-foreground disabled:opacity-35 hover:bg-workspace-hover"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="relative min-w-0 flex-1 rounded-full border border-workspace-border/80 bg-workspace-sidebar/85 px-3 py-1.5">
            {url ? (
              <div className="flex min-w-0 items-center gap-1 leading-none">
                {host ? (
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => void handleCopyPreviewUrl()}
                      className="max-w-[16rem] truncate rounded-sm text-[11px] font-medium text-workspace-foreground/60 transition-colors hover:text-workspace-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-workspace-accent/50"
                      aria-label="Copy preview URL"
                      title={`Copy preview URL: ${copyPreviewValue}`}
                    >
                      {host}
                    </button>
                  </div>
                ) : null}
                <span
                  className={cn(
                    "truncate text-[11px] font-mono text-workspace-foreground",
                    !host && "font-medium",
                  )}
                  title={url}
                >
                  {route || "/"}
                </span>
                <Button
                  variant="ghost"
                  type="button"
                  aria-label="Open preview in new tab"
                  onClick={onOpenInNewTab}
                  className="ml-auto flex h-4 w-4 shrink-0 cursor-pointer select-none items-center justify-center rounded text-workspace-foreground/40 transition-colors hover:bg-workspace-hover hover:text-workspace-foreground/80"
                >
                  <ExternalLink className="size-3" />
                </Button>
              </div>
            ) : (
              <span className="truncate text-[11px] text-workspace-foreground/60">
                Waiting for preview URL...
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 rounded-full border border-workspace-border/80 bg-workspace-sidebar/85 px-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit preview domain"
              disabled={!canEditSubdomain}
              onClick={handleOpenModal}
              className="h-7 w-7 rounded-full text-workspace-foreground disabled:opacity-35 hover:bg-workspace-hover"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Refresh preview"
              disabled={!url}
              onClick={onRefresh}
              className="h-7 w-7 rounded-full text-workspace-foreground disabled:opacity-35 hover:bg-workspace-hover"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {canEditSubdomain && chatId && (
        <SubdomainModal
          open={isModalOpen}
          onClose={handleCloseModal}
          chatId={chatId}
          currentSubdomain={subdomain}
          suffix={suffix}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
