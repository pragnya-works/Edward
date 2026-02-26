"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw, X, Copy, Check, FileCode } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edward/ui/components/card";
import { copyTextToClipboard } from "@edward/ui/lib/clipboard";
import { useSandbox } from "@/contexts/sandboxContext";
import { useOptionalChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { BuildStatus } from "@/stores/sandbox/types";

export function SandboxEmptyState() {
  const { buildStatus, isStreaming, fullErrorReport } = useSandbox();
  const workspace = useOptionalChatWorkspaceContext();
  const isInstallingDependencies =
    (workspace?.stream.installingDeps.length ?? 0) > 0;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback(async (key: string, text: string) => {
    if (!text) return;
    const copied = await copyTextToClipboard(text);
    if (!copied) return;

    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1600);
  }, []);

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

  const diagnosis = fullErrorReport?.userFacing;
  const rootCause = fullErrorReport?.rootCause ?? fullErrorReport?.errors?.[0];
  const pinpoint = diagnosis?.pinpoint;
  const pinpointLabel =
    pinpoint && pinpoint.file
      ? `${pinpoint.file}:${pinpoint.line}${pinpoint.column ? `:${pinpoint.column}` : ""}`
      : rootCause
        ? `${rootCause.error.file}:${rootCause.error.line}${rootCause.error.column ? `:${rootCause.error.column}` : ""}`
        : null;
  const fallbackPinpointContext =
    !diagnosis?.pinpointContext && rootCause && pinpointLabel
      ? `At ${pinpointLabel}, build failed with: ${(rootCause.error.message || "unknown error").split("\n")[0] || "unknown error"}.`
      : null;
  const fallbackPreciseFix =
    !diagnosis?.preciseFix && rootCause
      ? rootCause.suggestion ||
      `Open ${rootCause.error.file}:${rootCause.error.line}, fix this error at the pinpoint, then rebuild.`
      : null;
  const diagnosisCopyText = useMemo(() => {
    const lines: string[] = [];
    const shortMessage =
      diagnosis?.shortMessage || fullErrorReport?.headline || "Build failed.";
    const context = diagnosis?.pinpointContext || fallbackPinpointContext;
    const fix = diagnosis?.preciseFix || fallbackPreciseFix;

    if (shortMessage) {
      lines.push(shortMessage);
    }
    if (pinpointLabel) {
      lines.push(
        `Pinpoint: ${pinpointLabel}${pinpoint?.code ? ` (${pinpoint.code})` : ""}`,
      );
    }
    if (diagnosis?.probableCause) {
      lines.push(`Cause: ${diagnosis.probableCause}`);
    }
    if (context) {
      lines.push(`Context: ${context}`);
    }
    if (fix) {
      lines.push(`Fix: ${fix}`);
    }
    if (diagnosis?.nextStep) {
      lines.push(`Next: ${diagnosis.nextStep}`);
    }

    return lines.join("\n");
  }, [
    diagnosis?.nextStep,
    diagnosis?.pinpointContext,
    diagnosis?.preciseFix,
    diagnosis?.probableCause,
    diagnosis?.shortMessage,
    fallbackPinpointContext,
    fallbackPreciseFix,
    fullErrorReport?.headline,
    pinpoint?.code,
    pinpointLabel,
  ]);

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
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <div className="px-4 py-3 text-left space-y-3">
                  <div className="rounded-md border border-workspace-border bg-workspace-bg px-3 py-2">
                    <div className="flex items-start gap-2">
                      <p className="text-[13px] text-workspace-foreground font-medium whitespace-pre-wrap [overflow-wrap:anywhere] flex-1">
                        {diagnosis?.shortMessage || fullErrorReport?.headline || "Build failed."}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleCopy("diagnosis", diagnosisCopyText)}
                        className="h-6 w-6 rounded-sm text-workspace-foreground/70 hover:text-workspace-foreground shrink-0"
                        aria-label="Copy diagnosis"
                      >
                        {copiedKey === "diagnosis" ? (
                          <Check className="h-3.5 w-3.5 text-workspace-accent" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    {pinpointLabel ? (
                      <div className="mt-1 flex items-start gap-1.5">
                        <p className="text-[11px] text-workspace-foreground/70 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                          Pinpoint: <span className="font-mono">{pinpointLabel}</span>
                          {pinpoint?.code ? ` (${pinpoint.code})` : ""}
                        </p>
                      </div>
                    ) : null}
                    {diagnosis?.probableCause ? (
                      <p className="mt-1 text-[11px] text-workspace-foreground/70 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        Cause: {diagnosis.probableCause}
                      </p>
                    ) : null}
                    {diagnosis?.pinpointContext || fallbackPinpointContext ? (
                      <p className="mt-1 text-[11px] text-workspace-foreground/70 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        Context: {diagnosis?.pinpointContext || fallbackPinpointContext}
                      </p>
                    ) : null}
                    {diagnosis?.preciseFix || fallbackPreciseFix ? (
                      <p className="mt-1 text-[11px] text-workspace-foreground/80 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        Fix: {diagnosis?.preciseFix || fallbackPreciseFix}
                      </p>
                    ) : null}
                    {diagnosis?.nextStep ? (
                      <p className="mt-1 text-[11px] text-workspace-foreground/70 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        Next: {diagnosis.nextStep}
                      </p>
                    ) : null}
                  </div>

                  <details className="rounded-md border border-workspace-border bg-workspace-bg">
                    <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-workspace-foreground/80">
                      <div className="flex items-center justify-between gap-2">
                        <span>Technical build logs</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleCopy("logs", fullErrorReport?.rawOutput || "");
                          }}
                          className="h-6 w-6 rounded-sm text-workspace-foreground/70 hover:text-workspace-foreground"
                          aria-label="Copy technical logs"
                        >
                          {copiedKey === "logs" ? (
                            <Check className="h-3.5 w-3.5 text-workspace-accent" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </summary>
                    <div className="max-h-[32vh] overflow-auto px-3 pb-3">
                      <div className="space-y-1 font-mono text-[12px] leading-5">
                        {logLines.length > 0 ? (
                          logLines.map(({ line, lineNumber, key }) => (
                            <div
                              key={key}
                              className={cn(
                                "flex gap-2 rounded-sm px-2 py-1 items-start",
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
                              <span className="break-all whitespace-pre-wrap flex-1">
                                {line}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-workspace-foreground/70">
                            No diagnostic output available.
                          </p>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : isStreaming ||
          isInstallingDependencies ||
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
                  : isInstallingDependencies
                    ? "Installing..."
                  : buildStatus === BuildStatus.QUEUED
                    ? "Queued..."
                    : "Deploying..."}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {isStreaming
                  ? "Edward is typing..."
                  : isInstallingDependencies
                    ? "Installing project dependencies"
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
