"use client";

import { memo, useRef, useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus } from "@/contexts/sandboxContext";
import { Loader } from "lucide-react";
import dynamic from "next/dynamic";

interface MonacoThemeDefinition {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: unknown[];
  colors: Record<string, string>;
}

interface MonacoApi {
  editor: {
    defineTheme: (themeName: string, themeData: MonacoThemeDefinition) => void;
    setTheme: (themeName: string) => void;
  };
}

interface MonacoModel {
  getLineCount: () => number;
}

interface MonacoEditorInstance {
  getModel: () => MonacoModel | null;
  revealLine: (lineNumber: number) => void;
}

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-workspace-bg">
        <Loader className="h-5 w-5 animate-spin text-workspace-accent/60" />
      </div>
    ),
  },
);

interface CodeEditorProps {
  code: string;
  filename: string;
  readOnly?: boolean;
  isStreaming?: boolean;
  buildStatus?: BuildStatus;
  className?: string;
}

const WORKSPACE_MONACO_THEME = "workspace-theme";

interface WorkspacePalette {
  background?: string;
  foreground?: string;
  border?: string;
  active?: string;
  accent?: string;
  gutterForeground?: string;
  gutterLine?: string;
}

const getLanguageFromFilename = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx"].includes(ext)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return "javascript";
  if (["css", "scss"].includes(ext)) return "css";
  if (ext === "html") return "html";
  if (ext === "json") return "json";
  if (["md", "mdx"].includes(ext)) return "markdown";
  return "plaintext";
};

function readCssVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function normalizeMonacoColor(value: string): string | undefined {
  const v = value.trim();

  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }

  if (/^#[0-9a-f]{4}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}${v[4]}${v[4]}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{8}$/i.test(v)) {
    return v.toLowerCase();
  }

  const rgb = v.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i,
  );
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) =>
      Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"),
    );
    const alpha = rgb[4];
    if (typeof alpha === "string") {
      const a = Math.max(0, Math.min(1, Number(alpha)));
      return `#${r}${g}${b}${Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")}`.toLowerCase();
    }
    return `#${r}${g}${b}`.toLowerCase();
  }

  return undefined;
}

function resolveMonacoColor(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const directColor = normalizeMonacoColor(value);
  if (directColor) {
    return directColor;
  }

  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value;

  if (!probe.style.color) {
    return undefined;
  }

  probe.style.position = "fixed";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.inset = "0";
  document.documentElement.appendChild(probe);
  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return normalizeMonacoColor(resolvedColor);
}

function readWorkspacePalette(): WorkspacePalette {
  const read = (token: string) => resolveMonacoColor(readCssVariable(token));

  return {
    background: read("--workspace-bg"),
    foreground: read("--workspace-foreground"),
    border: read("--workspace-border"),
    active: read("--workspace-active"),
    accent: read("--workspace-accent"),
    gutterForeground: read("--workspace-gutter-fg"),
    gutterLine: read("--workspace-gutter-line"),
  };
}

function isDarkThemeColor(hexColor?: string): boolean {
  if (!hexColor) {
    return document.documentElement.classList.contains("dark");
  }

  const normalized = hexColor.replace("#", "");
  const hasAlpha = normalized.length === 8;
  const rgb = hasAlpha ? normalized.slice(0, 6) : normalized;

  if (rgb.length !== 6) {
    return document.documentElement.classList.contains("dark");
  }

  const red = Number.parseInt(rgb.slice(0, 2), 16);
  const green = Number.parseInt(rgb.slice(2, 4), 16);
  const blue = Number.parseInt(rgb.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance < 140;
}

function applyWorkspaceMonacoTheme(monaco: MonacoApi): void {
  const palette = readWorkspacePalette();
  const selection = palette.active ?? palette.border;

  const colors = {
    "editor.background": palette.background,
    "editor.foreground": palette.foreground,
    "editorLineNumber.foreground": palette.gutterForeground ?? palette.foreground,
    "editorLineNumber.activeForeground": palette.foreground,
    "editor.selectionBackground": selection,
    "editor.inactiveSelectionBackground": selection,
    "editorCursor.foreground": palette.accent,
    "editorIndentGuide.background1": palette.gutterLine ?? palette.border,
    "editorLineNumber.border": palette.gutterLine ?? palette.border,
    "editorBracketMatch.background": selection,
  };

  monaco.editor.defineTheme(WORKSPACE_MONACO_THEME, {
    base: isDarkThemeColor(palette.background) ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: Object.fromEntries(
      Object.entries(colors).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>,
  });
}

type EditorStatusTone = "accent" | "destructive";

interface EditorStatusBadgeProps {
  statusKey: string;
  label: string;
  tone: EditorStatusTone;
  indicatorClassName: string;
}

function EditorStatusBadge({
  statusKey,
  label,
  tone,
  indicatorClassName,
}: EditorStatusBadgeProps) {
  const toneClassName =
    tone === "destructive"
      ? "bg-destructive/10 border-destructive/20 shadow-destructive/10 text-destructive"
      : "bg-workspace-sidebar/90 border-workspace-border shadow-workspace-accent/10 text-workspace-accent";

  return (
    <m.div
      key={statusKey}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className={cn(
        "absolute bottom-6 right-8 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md shadow-lg z-20 pointer-events-none",
        toneClassName,
      )}
    >
      <div className={cn("h-2 w-2 rounded-full", indicatorClassName)} />
      <span>{label}</span>
    </m.div>
  );
}

export const CodeEditor = memo(function CodeEditor({
  code,
  filename,
  readOnly = true,
  isStreaming = false,
  buildStatus = BuildStatus.IDLE,
  className,
}: CodeEditorProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const [isEditorMounted, setIsEditorMounted] = useState(false);
  const editorValue = typeof code === "string" ? code : String(code ?? "");
  const statusBadge = isStreaming
    ? {
        key: "streaming",
        label: "Streaming",
        tone: "accent" as const,
        indicatorClassName: "bg-workspace-accent animate-pulse",
      }
    : buildStatus === BuildStatus.QUEUED
      ? {
          key: "queued",
          label: "Queued",
          tone: "accent" as const,
          indicatorClassName: "bg-workspace-accent animate-pulse",
        }
      : buildStatus === BuildStatus.BUILDING
        ? {
            key: "deploying",
            label: "Deploying",
            tone: "accent" as const,
            indicatorClassName: "bg-workspace-accent animate-spin-slow",
          }
        : buildStatus === BuildStatus.FAILED
          ? {
              key: "failed",
              label: "Build Failed",
              tone: "destructive" as const,
              indicatorClassName: "bg-destructive",
            }
          : null;

  const handleEditorWillMount = (monaco: MonacoApi) => {
    applyWorkspaceMonacoTheme(monaco);
  };

  const handleEditorDidMount = (
    editor: MonacoEditorInstance,
    monaco: MonacoApi,
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyWorkspaceMonacoTheme(monaco);
    monaco.editor.setTheme(WORKSPACE_MONACO_THEME);
    setIsEditorMounted(true);
  };

  useEffect(() => {
    if (!isEditorMounted || !monacoRef.current) {
      return;
    }

    const applyTheme = () => {
      if (!monacoRef.current) {
        return;
      }

      applyWorkspaceMonacoTheme(monacoRef.current);
      monacoRef.current.editor.setTheme(WORKSPACE_MONACO_THEME);
    };

    applyTheme();

    const root = document.documentElement;
    const observer = new MutationObserver(applyTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", applyTheme);
    };
  }, [isEditorMounted]);

  useEffect(() => {
    if (isStreaming && editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        editor.revealLine(lineCount);
      }
    }
  }, [isStreaming, code]);

  return (
    <div className={cn("relative h-full w-full group/editor", className)}>
      <MonacoEditor
        height="100%"
        width="100%"
        language={getLanguageFromFilename(filename)}
        theme={WORKSPACE_MONACO_THEME}
        value={editorValue}
        options={{
          readOnly,
          minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', monospace",
          fontLigatures: true,
          lineHeight: 21,
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          formatOnPaste: true,
          wordWrap: "on",
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
      />

      <AnimatePresence mode="wait">
        {statusBadge ? (
          <EditorStatusBadge
            statusKey={statusBadge.key}
            label={statusBadge.label}
            tone={statusBadge.tone}
            indicatorClassName={statusBadge.indicatorClassName}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
});
