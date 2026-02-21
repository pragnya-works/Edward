"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";

interface SandboxPreviewBarProps {
  url: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOpenInNewTab: () => void;
  onRefresh: () => void;
}

function formatPreviewUrl(url: string | null): { host: string; route: string } {
  if (!url) {
    return { host: "", route: "" };
  }

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

export function SandboxPreviewBar({
  url,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onOpenInNewTab,
  onRefresh,
}: SandboxPreviewBarProps) {
  const { host, route } = formatPreviewUrl(url);

  return (
    <div className="shrink-0 border-b border-workspace-border bg-workspace-sidebar px-2.5 py-2 md:px-3">
      <div className="flex h-10 items-center gap-1.5 rounded-full border border-workspace-border bg-workspace-bg px-1.5">
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

        <div className="min-w-0 flex-1 rounded-full border border-workspace-border/80 bg-workspace-sidebar/85 px-3 py-1.5">
          {url ? (
            <div className="flex min-w-0 items-center gap-1.5 leading-none">
              {host ? (
                <span className="shrink-0 text-[11px] font-medium text-workspace-foreground/60">
                  {host}
                </span>
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
            aria-label="Open preview in new tab"
            disabled={!url}
            onClick={onOpenInNewTab}
            className="h-7 w-7 rounded-full text-workspace-foreground disabled:opacity-35 hover:bg-workspace-hover"
          >
            <ExternalLink className="h-3.5 w-3.5" />
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
  );
}
