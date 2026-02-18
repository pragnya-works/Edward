"use client";

import { memo } from "react";
import { m } from "motion/react";
import { AlertTriangle, CheckCircle2, ExternalLink, Link2 } from "lucide-react";
import type { UrlScrapeEvent } from "@/lib/chatTypes";
import Link from "next/link";

interface UrlScrapeBlockProps {
  scrape: UrlScrapeEvent;
}

function getHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const UrlScrapeBlock = memo(function UrlScrapeBlock({
  scrape,
}: UrlScrapeBlockProps) {
  const successCount = scrape.results.filter((result) => result.status === "success").length;
  const errorCount = scrape.results.length - successCount;

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg sm:rounded-xl border border-border/40 overflow-hidden bg-foreground/[0.02] w-full"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-foreground/[0.04] border-b border-border/20">
        <Link2 className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-emerald-600 dark:text-emerald-400/70 shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-mono text-foreground/80 dark:text-muted-foreground/70 truncate">
          {successCount} scraped
          {errorCount > 0 ? `, ${errorCount} failed` : ""}
        </span>
      </div>

      <div className="px-2.5 sm:px-3 py-2 sm:py-2.5 flex flex-col gap-1.5">
        {scrape.results.map((result) => {
          const href = result.finalUrl || result.url;
          const isSuccess = result.status === "success";

          return (
            <Link
              key={`url-scrape-result-${href}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border/30 px-2 py-1.5 hover:bg-foreground/[0.03] transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {isSuccess ? (
                  <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-500 shrink-0" />
                )}
                <span className="text-[10px] sm:text-[11px] font-medium text-foreground/80 dark:text-foreground/70 truncate">
                  {isSuccess ? result.title || getHost(href) : getHost(href)}
                </span>
                <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground/60 shrink-0 ml-auto" />
              </div>
              {isSuccess ? (
                result.snippet ? (
                  <p className="text-[10px] sm:text-[11px] leading-[1.5] text-foreground/65 dark:text-foreground/55 mt-1 line-clamp-2">
                    {result.snippet}
                  </p>
                ) : null
              ) : (
                <p className="text-[10px] sm:text-[11px] leading-[1.5] text-red-700/80 dark:text-red-400/80 mt-1 line-clamp-2">
                  {result.error || "Failed to extract content from this URL."}
                </p>
              )}
              <p className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/70 mt-1 truncate">
                {getHost(href)}
              </p>
            </Link>
          );
        })}
      </div>
    </m.div>
  );
});
