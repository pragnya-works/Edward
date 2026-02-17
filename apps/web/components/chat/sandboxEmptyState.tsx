"use client";

import { useCallback, useState } from "react";
import { RefreshCw, X, Copy, Check, FileCode } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { cn } from "@edward/ui/lib/utils";
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

  return (
    <div className="flex-1 flex items-center justify-center bg-workspace-bg">
      <div className="flex flex-col items-center gap-3 w-full max-w-md px-6 text-center text-workspace-foreground">
        {buildStatus === BuildStatus.FAILED ? (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="relative group">
              <div className="absolute -inset-4 bg-destructive/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative h-20 w-20 rounded-[2.5rem] bg-destructive/10 border border-destructive/20 flex items-center justify-center shadow-2xl shadow-destructive/20 active:scale-95 transition-transform">
                <X className="h-10 w-10 text-destructive drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
              </div>
            </div>

            <div className="space-y-6 w-full text-center">
              <div className="space-y-2">
                <h3 className="text-xl font-black text-foreground tracking-tight sm:text-2xl">
                  Build Failure
                </h3>
                <p className="text-sm text-muted-foreground font-medium max-w-md mx-auto leading-relaxed italic opacity-80">
                  Diagnostics detected{" "}
                  {fullErrorReport?.errors?.length || "significant"} issues
                  blocking deployment.
                </p>
              </div>

              {fullErrorReport?.rawOutput && (
                <div className="relative w-full group overflow-hidden">
                  <div className="absolute inset-0 bg-black/5 dark:bg-white/[0.02] backdrop-blur-2xl rounded-3xl" />
                  <div className="absolute inset-0 ring-1 ring-black/10 dark:ring-white/10 rounded-3xl" />

                  <div className="relative flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em] ml-2">
                        Diagnostic Console
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-all px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-green-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 opacity-70" />
                          <span>Copy Logs</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative p-6 max-h-96 overflow-y-auto custom-scrollbar selection:bg-destructive/30">
                    <div className="space-y-1 font-mono text-[12px] leading-6 tracking-tight">
                      {fullErrorReport.rawOutput
                        .split("\n")
                        .map((line: string, index: number) => (
                          <div
                            key={index}
                            className={cn(
                              "flex gap-4 group/line transition-colors hover:bg-white/[0.02]",
                              line.toLowerCase().includes("error")
                                ? "text-destructive/90 bg-destructive/[0.02]"
                                : line.toLowerCase().includes("warn")
                                  ? "text-amber-500/90"
                                  : "text-foreground/70",
                            )}
                          >
                            <span className="shrink-0 text-muted-foreground/30 text-right w-6 select-none leading-inherit">
                              {index + 1}
                            </span>
                            <span className="break-all whitespace-pre-wrap leading-inherit">
                              {line}
                            </span>
                          </div>
                        ))}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/5 dark:from-black/20 to-transparent pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              className="h-10 text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-transparent tracking-widest uppercase transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2 opacity-50" />
              Retry Provisioning
            </Button>
          </div>
        ) : isStreaming ||
          buildStatus === BuildStatus.QUEUED ||
          buildStatus === BuildStatus.BUILDING ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-3xl bg-amber-500/10 flex items-center justify-center">
                <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border border-amber-500/20 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[12px] font-bold tracking-tight text-amber-500/80 uppercase">
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
          <div className="flex flex-col items-center gap-3 opacity-20">
            <div className="h-12 w-12 rounded-2xl bg-foreground/[0.05] flex items-center justify-center">
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
