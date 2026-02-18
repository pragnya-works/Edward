"use client";

import { memo } from "react";
import { m } from "motion/react";
import { ExternalLink, Globe, Search, AlertTriangle } from "lucide-react";
import type { WebSearchEvent } from "@/lib/chatTypes";

interface WebSearchBlockProps {
  search: WebSearchEvent;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const WebSearchBlock = memo(function WebSearchBlock({
  search,
}: WebSearchBlockProps) {
  const hasResults = (search.results?.length ?? 0) > 0;
  const isError = Boolean(search.error);

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg sm:rounded-xl border border-border/40 overflow-hidden bg-foreground/[0.02] w-full"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-foreground/[0.04] border-b border-border/20">
        <Search className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-sky-600 dark:text-sky-400/70 shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-mono text-foreground/80 dark:text-muted-foreground/70 truncate">
          {search.query}
        </span>
      </div>

      <div className="px-2.5 sm:px-3 py-2 sm:py-2.5 flex flex-col gap-2">
        {isError ? (
          <div className="flex items-start gap-1.5 sm:gap-2 text-red-700 dark:text-red-400/80">
            <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mt-0.5 shrink-0" />
            <p className="text-[10px] sm:text-[11px] leading-[1.5] break-words">
              {search.error}
            </p>
          </div>
        ) : (
          <>
            {search.answer ? (
              <p className="text-[11px] sm:text-xs leading-[1.6] text-foreground/85 dark:text-foreground/70">
                {search.answer}
              </p>
            ) : null}

            {hasResults ? (
              <div className="flex flex-col gap-1.5">
                {search.results!.map((result) => (
                  <a
                    key={`search-result-${result.url}`}
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-border/30 px-2 py-1.5 hover:bg-foreground/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground/70 shrink-0" />
                      <span className="text-[10px] sm:text-[11px] font-medium text-foreground/80 dark:text-foreground/70 truncate">
                        {result.title}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground/60 shrink-0 ml-auto" />
                    </div>
                    {result.snippet ? (
                      <p className="text-[10px] sm:text-[11px] leading-[1.5] text-foreground/65 dark:text-foreground/55 mt-1 line-clamp-2">
                        {result.snippet}
                      </p>
                    ) : null}
                    <p className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/70 mt-1 truncate">
                      {normalizeUrl(result.url)}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[10px] sm:text-[11px] leading-[1.5] text-muted-foreground/70">
                Web search requested.
              </p>
            )}
          </>
        )}
      </div>
    </m.div>
  );
});
