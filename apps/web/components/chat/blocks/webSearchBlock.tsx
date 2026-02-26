"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { m } from "motion/react";
import {
  ExternalLink,
  Globe,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { WebSearchEvent } from "@edward/shared/streamEvents";

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

export function WebSearchBlock({
  search,
}: WebSearchBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const contentId = useId();
  const results = useMemo(() => search.results ?? [], [search.results]);
  const hasResults = results.length > 0;
  const isError = Boolean(search.error);
  const hasAnswer = Boolean(search.answer);
  const maxResults = search.maxResults;

  const status = isError
    ? "failed"
    : hasResults || hasAnswer
      ? "complete"
      : "pending";

  const domains = useMemo(
    () =>
      Array.from(
        new Set(results.map((result) => normalizeUrl(result.url)).filter(Boolean)),
      ).slice(0, 3),
    [results],
  );

  const summaryText = isError
    ? "Search failed"
    : hasResults
      ? `Retrieved ${results.length}${typeof maxResults === "number" ? `/${maxResults}` : ""} sources`
      : "Searching...";

  useEffect(() => {
    if (status !== "complete") {
      setIsCollapsed(false);
    }
  }, [status]);

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg sm:rounded-xl border border-border/40 overflow-hidden bg-foreground/[0.02] w-full"
    >
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        className="w-full flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-foreground/[0.04] border-b border-border/20 text-left hover:bg-foreground/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <Search className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-sky-600 dark:text-sky-400/70 shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-mono text-foreground/80 dark:text-muted-foreground/70 truncate">
          {search.query}
        </span>
        <span
          className={[
            "ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium shrink-0",
            status === "failed"
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : status === "complete"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
          ].join(" ")}
        >
          {status === "failed" ? (
            <AlertTriangle className="h-2.5 w-2.5" />
          ) : status === "complete" ? (
            <CheckCircle2 className="h-2.5 w-2.5" />
          ) : (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          )}
          {summaryText}
        </span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 shrink-0">
          {isCollapsed ? "Show details" : "Hide details"}
        </span>
      </button>

      <m.div
        id={contentId}
        initial={false}
        animate={{
          height: isCollapsed ? 0 : "auto",
          opacity: isCollapsed ? 0 : 1,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="overflow-hidden"
      >
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
              {hasAnswer ? (
                <p className="text-[11px] sm:text-xs leading-[1.6] text-foreground/85 dark:text-foreground/70 rounded-md border border-border/25 bg-foreground/[0.02] px-2 py-1.5">
                  {search.answer}
                </p>
              ) : null}

              {domains.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  {domains.map((domain) => (
                    <span
                      key={`domain-pill-${domain}`}
                      className="inline-flex items-center rounded-full border border-border/30 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-muted-foreground"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              ) : null}

              {hasResults ? (
                <div className="flex flex-col gap-1.5">
                  {results.map((result, index) => (
                    <a
                      key={`search-result-${result.url}`}
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border/30 px-2 py-1.5 hover:bg-foreground/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 font-mono shrink-0">
                          {index + 1}.
                        </span>
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
                  Search was requested. Retrieved sources will appear here.
                </p>
              )}
            </>
          )}
        </div>
      </m.div>
    </m.div>
  );
}
