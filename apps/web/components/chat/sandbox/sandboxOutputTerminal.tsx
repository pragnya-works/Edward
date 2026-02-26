"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, m } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { Badge } from "@edward/ui/components/badge";
import { cn } from "@edward/ui/lib/utils";
import { useMobileViewport } from "@edward/ui/hooks/useMobileViewport";
import { useSandbox } from "@/contexts/sandboxContext";
import type { SandboxTerminalEntry } from "@/stores/sandbox/types";

const DESKTOP_DEFAULT_TERMINAL_HEIGHT = 220;
const MOBILE_DEFAULT_TERMINAL_HEIGHT = 168;
const DESKTOP_MIN_TERMINAL_HEIGHT = 140;
const MOBILE_MIN_TERMINAL_HEIGHT = 120;
const MAX_TERMINAL_HEIGHT_PX = 440;
const MAX_TERMINAL_HEIGHT_RATIO = 0.5;

interface TerminalResizeState {
  pointerId: number;
  startY: number;
  startHeight: number;
}

interface TerminalCollapsedProps {
  entryCount: number;
  onOpen: () => void;
}

interface TerminalResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

interface TerminalHeaderProps {
  title: string;
  hasEntries: boolean;
  onClear: () => void;
  onClose: () => void;
}

interface TerminalEntriesProps {
  entries: SandboxTerminalEntry[];
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCommandLine(entry: SandboxTerminalEntry): string {
  const args = Array.isArray(entry.args) ? entry.args : [];
  return [entry.command, ...args].filter(Boolean).join(" ");
}

function getKindIcon(entry: SandboxTerminalEntry) {
  switch (entry.kind) {
    case "warning":
      return AlertTriangle;
    case "error":
      return XCircle;
    case "success":
      return CheckCircle2;
    case "command":
      return Terminal;
    case "system":
    default:
      return Info;
  }
}

function getKindClasses(entry: SandboxTerminalEntry): string {
  switch (entry.kind) {
    case "warning":
      return "text-amber-600 dark:text-amber-300";
    case "error":
      return "text-rose-600 dark:text-rose-300";
    case "success":
      return "text-emerald-600 dark:text-emerald-300";
    case "command":
      return "text-sky-600 dark:text-cyan-300";
    case "system":
    default:
      return "text-workspace-foreground/75";
  }
}

function clampTerminalHeight(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function TerminalCollapsed({ entryCount, onOpen }: TerminalCollapsedProps) {
  const hasEntries = entryCount > 0;

  return (
    <m.div
      key="terminal-collapsed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="bg-workspace-sidebar/95 px-2 py-1.5"
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="h-8 w-full gap-2 rounded-md px-2 text-[11px] text-workspace-foreground/85 hover:bg-workspace-hover hover:text-workspace-foreground"
        aria-label="Show output terminal"
      >
        <Terminal className="h-3.5 w-3.5 text-workspace-accent" />
        <span className="font-semibold tracking-wide">Output Terminal</span>
        {hasEntries ? (
          <Badge
            variant="secondary"
            className="h-4 rounded-sm border border-workspace-border bg-workspace-bg px-1.5 text-[9px] text-workspace-foreground/70"
          >
            {entryCount}
          </Badge>
        ) : null}
        <ChevronUp className="ml-auto h-3.5 w-3.5 text-workspace-foreground/55" />
      </Button>
    </m.div>
  );
}

function TerminalResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: TerminalResizeHandleProps) {
  return (
    <div className="relative h-2 shrink-0 border-b border-workspace-border/70">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        className="group absolute inset-0 cursor-row-resize touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-workspace-accent/55"
        aria-label="Resize terminal"
      >
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-workspace-border transition-colors group-hover:bg-workspace-accent/60" />
      </button>
    </div>
  );
}

function TerminalHeader({
  title,
  hasEntries,
  onClear,
  onClose,
}: TerminalHeaderProps) {
  return (
    <div className="flex h-10 items-center justify-between gap-2 border-b border-workspace-border/70 bg-workspace-sidebar px-2.5">
      <div className="min-w-0 flex items-center gap-1.5">
        <Terminal className="h-3.5 w-3.5 text-workspace-accent" />
        <span className="truncate text-[11px] font-semibold tracking-wide">{title}</span>
        <Badge
          variant="secondary"
          className="h-4 rounded-sm border border-workspace-border bg-workspace-bg px-1.5 text-[9px] text-workspace-foreground/65"
        >
          Read-only
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClear}
          disabled={!hasEntries}
          className="h-7 w-7 rounded-md text-workspace-foreground/70 hover:bg-workspace-hover hover:text-workspace-foreground disabled:opacity-40"
          aria-label="Clear terminal output"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-7 w-7 rounded-md text-workspace-foreground/70 hover:bg-workspace-hover hover:text-workspace-foreground"
          aria-label="Close terminal"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function TerminalEntries({ entries }: TerminalEntriesProps) {
  if (entries.length === 0) {
    return (
      <div className="py-2 text-[11px] text-workspace-foreground/60">
        Waiting for sandbox output...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const Icon = getKindIcon(entry);
        const commandLine = entry.kind === "command" ? formatCommandLine(entry) : null;

        return (
          <div
            key={entry.id}
            className="rounded-md border border-workspace-border/70 bg-workspace-sidebar/50 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5">
              <Icon className={cn("h-3.5 w-3.5", getKindClasses(entry))} />
              <span className="text-[10px] text-workspace-foreground/55">
                {formatTimestamp(entry.createdAt)}
              </span>
              <span className={cn("truncate", getKindClasses(entry))}>
                {entry.message}
              </span>
            </div>

            {commandLine ? (
              <pre className="mt-1 whitespace-pre-wrap break-all text-sky-700 dark:text-cyan-300">
                {`$ ${commandLine}`}
              </pre>
            ) : null}

            {entry.stdout ? (
              <pre className="mt-1 whitespace-pre-wrap break-all text-workspace-foreground/85">
                {entry.stdout}
              </pre>
            ) : null}

            {entry.stderr ? (
              <pre className="mt-1 whitespace-pre-wrap break-all text-rose-600 dark:text-rose-300">
                {entry.stderr}
              </pre>
            ) : null}

            {typeof entry.exitCode === "number" ? (
              <div className="mt-1 text-[10px] text-workspace-foreground/55">
                exit {entry.exitCode}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SandboxOutputTerminal() {
  const isMobile = useMobileViewport();
  const {
    terminalEntries,
    isTerminalOpen,
    setTerminalOpen,
    toggleTerminalOpen,
    clearTerminalEntries,
  } = useSandbox();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const resizeStateRef = useRef<TerminalResizeState | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  const [terminalHeight, setTerminalHeight] = useState(
    DESKTOP_DEFAULT_TERMINAL_HEIGHT,
  );

  const hasEntries = terminalEntries.length > 0;
  const terminalTitle = hasEntries
    ? `Output Terminal (${terminalEntries.length})`
    : "Output Terminal";
  const minTerminalHeight = isMobile
    ? MOBILE_MIN_TERMINAL_HEIGHT
    : DESKTOP_MIN_TERMINAL_HEIGHT;
  const maxTerminalHeight = useMemo(() => {
    const adaptiveMax = Math.round(viewportHeight * MAX_TERMINAL_HEIGHT_RATIO);
    return Math.max(
      minTerminalHeight + 24,
      Math.min(MAX_TERMINAL_HEIGHT_PX, adaptiveMax),
    );
  }, [minTerminalHeight, viewportHeight]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= 20;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const initialHeight = isMobile
      ? MOBILE_DEFAULT_TERMINAL_HEIGHT
      : DESKTOP_DEFAULT_TERMINAL_HEIGHT;

    setTerminalHeight((current) =>
      clampTerminalHeight(current || initialHeight, minTerminalHeight, maxTerminalHeight),
    );
  }, [isMobile, maxTerminalHeight, minTerminalHeight]);

  useEffect(() => {
    if (!isTerminalOpen) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport || !shouldStickToBottomRef.current) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [isTerminalOpen, terminalEntries.length, terminalHeight]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isResizing]);

  const openTerminalPanel = useCallback(() => {
    setTerminalOpen(true);
  }, [setTerminalOpen]);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isTerminalOpen) {
        return;
      }

      resizeStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: terminalHeight,
      };
      setIsResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isTerminalOpen, terminalHeight],
  );

  const handleResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      const delta = resizeState.startY - event.clientY;
      setTerminalHeight(
        clampTerminalHeight(
          resizeState.startHeight + delta,
          minTerminalHeight,
          maxTerminalHeight,
        ),
      );
    },
    [maxTerminalHeight, minTerminalHeight],
  );

  const handleResizeEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      resizeStateRef.current = null;
      setIsResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  return (
    <div className="shrink-0 border-t border-workspace-border bg-workspace-sidebar text-workspace-foreground">
      <AnimatePresence initial={false} mode="wait">
        {!isTerminalOpen ? (
          <TerminalCollapsed
            entryCount={terminalEntries.length}
            onOpen={openTerminalPanel}
          />
        ) : (
          <m.div
            key="terminal-open"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.08, ease: "linear" },
            }}
            className="overflow-hidden"
          >
            <TerminalResizeHandle
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              onLostPointerCapture={handleResizeEnd}
            />

            <TerminalHeader
              title={terminalTitle}
              hasEntries={hasEntries}
              onClear={clearTerminalEntries}
              onClose={toggleTerminalOpen}
            />

            <div
              className={cn(
                "overflow-hidden transition-[height] duration-150 ease-out",
                isResizing && "transition-none",
              )}
              style={{ height: `${terminalHeight}px` }}
            >
              <div
                ref={viewportRef}
                onScroll={handleScroll}
                aria-readonly="true"
                className="h-full overflow-y-auto bg-workspace-bg px-2.5 py-2 font-mono text-[11px] leading-5 [scrollbar-gutter:stable]"
              >
                <TerminalEntries entries={terminalEntries} />
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
