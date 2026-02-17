"use client";

import { memo, useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus } from "@/contexts/sandboxContext";

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const FILE_EXTENSIONS = {
  HTML: "html",
  JSON: "json",
} as const;

// Premium High-Contrast AI Theme
const premiumHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "oklch(0.65 0.2 264)" },
  { tag: t.operator, color: "var(--foreground)" },
  { tag: t.special(t.string), color: "oklch(0.6 0.15 45)" },
  { tag: t.string, color: "oklch(0.6 0.15 45)" },
  { tag: t.atom, color: "oklch(0.7 0.1 140)" },
  { tag: t.number, color: "oklch(0.7 0.1 140)" },
  { tag: t.definition(t.variableName), color: "oklch(0.65 0.15 200)" },
  { tag: t.variableName, color: "oklch(0.65 0.15 200)" },
  { tag: t.function(t.variableName), color: "oklch(0.75 0.15 85)" },
  { tag: t.propertyName, color: "oklch(0.65 0.15 200)" },
  { tag: t.comment, color: "oklch(0.55 0.05 140)", fontStyle: "italic" },
  { tag: t.meta, color: "oklch(0.65 0.2 264)" },
  { tag: t.bracket, color: "oklch(0.75 0.2 80)" },
]);

function getLanguageExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
    return javascript({ jsx: true, typescript: ext.startsWith("t") });
  }
  if (["css", "scss"].includes(ext)) {
    return css();
  }
  if (ext === FILE_EXTENSIONS.HTML) {
    return html();
  }
  if (ext === FILE_EXTENSIONS.JSON) {
    return json();
  }
  if (["md", "mdx"].includes(ext)) {
    return markdown();
  }
  return [];
}

const premiumEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', monospace",
      backgroundColor: "transparent",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.6",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "var(--foreground)",
    },
    ".cm-line": {
      padding: "0 24px",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--workspace-active) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--foreground)",
      borderLeftWidth: "2px",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--workspace-gutter-fg)",
    },
  },
  { dark: true },
);

interface CodeEditorProps {
  code: string;
  filename: string;
  readOnly?: boolean;
  isStreaming?: boolean;
  buildStatus?: BuildStatus;
  className?: string;
}

export const CodeEditor = memo(function CodeEditor({
  code,
  filename,
  readOnly = true,
  isStreaming = false,
  buildStatus = BuildStatus.IDLE,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const codeRef = useRef(code);
  const initialCodeRef = useRef(code);
  const initialFilenameRef = useRef(filename);
  const initialReadOnlyRef = useRef(readOnly);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    if (!viewRef.current) return;

    const { state } = viewRef.current;
    if (state.doc.toString() !== codeRef.current) {
      viewRef.current.dispatch({
        changes: { from: 0, to: state.doc.length, insert: codeRef.current },
      });

      if (isStreaming) {
        viewRef.current.dispatch({
          selection: { anchor: codeRef.current.length },
          scrollIntoView: true,
        });
      }
    }
  }, [code, isStreaming]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      history(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      foldGutter(),
      keymap.of(defaultKeymap),
      keymap.of(historyKeymap),
      keymap.of([indentWithTab]),
      languageCompartment.of(getLanguageExtension(initialFilenameRef.current)),
      syntaxHighlighting(premiumHighlightStyle),
      themeCompartment.of([premiumEditorTheme]),
      EditorView.lineWrapping,
      readOnlyCompartment.of(
        EditorState.readOnly.of(initialReadOnlyRef.current),
      ),
    ];

    const state = EditorState.create({
      doc: initialCodeRef.current,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current) return;

    viewRef.current.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(filename)),
    });
  }, [filename]);

  useEffect(() => {
    if (!viewRef.current) return;

    viewRef.current.dispatch({
      effects: readOnlyCompartment.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  return (
    <div className={cn("relative h-full w-full group/editor", className)}>
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      <AnimatePresence mode="wait">
        {isStreaming ? (
          <motion.div
            key="streaming"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md z-20 pointer-events-none shadow-lg shadow-primary/5"
          >
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
              Streaming
            </span>
          </motion.div>
        ) : buildStatus === BuildStatus.QUEUED ? (
          <motion.div
            key="queued"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 backdrop-blur-md z-20 pointer-events-none shadow-lg shadow-sky-500/5"
          >
            <div className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
            <span className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">
              Queued
            </span>
          </motion.div>
        ) : buildStatus === BuildStatus.BUILDING ? (
          <motion.div
            key="deploying"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-md z-20 pointer-events-none shadow-lg shadow-amber-500/5"
          >
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-spin-slow" />
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
              Deploying
            </span>
          </motion.div>
        ) : buildStatus === BuildStatus.FAILED ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 backdrop-blur-md z-20 pointer-events-none shadow-lg shadow-destructive/5"
          >
            <div className="h-2 w-2 rounded-full bg-destructive" />
            <span className="text-[10px] font-bold text-destructive uppercase tracking-widest">
              Build Failed
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
