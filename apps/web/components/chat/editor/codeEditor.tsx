"use client";

import { memo, useRef, useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus } from "@/stores/sandbox/types";
import { Loader } from "lucide-react";
import dynamic from "next/dynamic";
import {
  applyWorkspaceMonacoTheme,
  type MonacoApi,
  WORKSPACE_MONACO_THEME,
} from "@/components/chat/editor/monacoTheme";

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
