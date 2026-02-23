"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw, X, Copy, Check, FileCode } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edward/ui/components/card";
import { BuildStatus, useSandbox } from "@/contexts/sandboxContext";

export function SandboxEmptyState() {
  const { buildStatus, isStreaming, fullErrorReport } = useSandbox();
  const [copied, setCopied] = useState(false);

  const handleCopyLogs = useCallback(() => {
    if (fullErrorReport?.rawOutput) {
      navigator.clipboard.writeText(fullErrorReport.rawOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [fullErrorReport?.rawOutput]);

  const logLines = useMemo(() => {
    if (!fullErrorReport?.rawOutput) return [];

    const seen = new Map<string, number>();
    return fullErrorReport.rawOutput.split("\n").map((line, lineNumber) => {
      const count = (seen.get(line) ?? 0) + 1;
      seen.set(line, count);
      return {
        line,
        lineNumber: lineNumber + 1,
        key: `log-${line}-${count}`,
      };
    });
  }, [fullErrorReport?.rawOutput]);

  return (
    <div className="flex-1 flex items-center justify-center bg-workspace-bg">
      <div className="flex flex-col items-center gap-3 w-full max-w-3xl px-4 md:px-6 text-center text-workspace-foreground">
        {buildStatus === BuildStatus.FAILED ? (
          <div className="flex flex-col items-center gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <X className="h-7 w-7 text-destructive" />
            </div>

            <Card className="w-full bg-workspace-sidebar border-workspace-border shadow-none gap-0 py-0">
              <CardHeader className="px-4 py-3 border-b border-workspace-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left">
                    <CardTitle className="text-sm font-semibold text-workspace-foreground">
                      Build Failure
                    </CardTitle>
                    <p className="text-xs text-workspace-foreground/70 mt-1">
                      Diagnostics detected {fullErrorReport?.errors?.length ?? "multiple"} issues.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyLogs}
                    className="h-7 border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-workspace-accent" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Logs
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <div className="max-h-[46vh] overflow-auto px-4 py-3 text-left">
                  <div className="space-y-1 font-mono text-[12px] leading-5">
                    {logLines.length > 0 ? (
                      logLines.map(({ line, lineNumber, key }) => (
                        <div
                          key={key}
                          className={cn(
                            "flex gap-3 rounded-sm px-2 py-1",
                            line.toLowerCase().includes("error")
                              ? "text-destructive bg-destructive/10"
                              : line.toLowerCase().includes("warn")
                                ? "text-workspace-accent"
                                : "text-workspace-foreground/80",
                          )}
                        >
                          <span className="shrink-0 text-workspace-foreground/50 w-7 text-right">
                            {lineNumber}
                          </span>
                          <span className="break-all whitespace-pre-wrap">{line}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-workspace-foreground/70">
                        No diagnostic output available.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : isStreaming ||
          buildStatus === BuildStatus.QUEUED ||
          buildStatus === BuildStatus.BUILDING ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-3xl bg-workspace-active/70 border border-workspace-border flex items-center justify-center">
                <RefreshCw className="h-8 w-8 text-workspace-accent animate-spin" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-workspace-bg border border-workspace-border flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-workspace-accent animate-pulse" />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[12px] font-bold tracking-tight text-workspace-accent uppercase">
                {isStreaming
                  ? "Coding..."
                  : buildStatus === BuildStatus.QUEUED
                    ? "Queued..."
                    : "Deploying..."}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {isStreaming
                  ? "Edward is typing..."
                  : "Spinning up your application environment"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 opacity-40">
            <div className="h-12 w-12 rounded-2xl bg-workspace-sidebar border border-workspace-border flex items-center justify-center">
              <FileCode className="h-6 w-6" />
            </div>
            <span className="text-[11px] font-medium tracking-tight">
              Select a file
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
