"use client";

import { memo, useEffect, useRef } from "react";
import { m, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { BuildStatus } from "@/contexts/sandboxContext";

const FILE_EXTENSIONS = {
  HTML: "html",
  JSON: "json",
} as const;

type EditorViewInstance = {
  state: { doc: { toString: () => string; length: number } };
  dispatch: (payload: unknown) => void;
  destroy: () => void;
};

type LoadedCodeMirror = {
  Compartment: new () => {
    of: (value: unknown) => unknown;
    reconfigure: (value: unknown) => unknown;
  };
  EditorState: {
    allowMultipleSelections: { of: (value: boolean) => unknown };
    readOnly: { of: (value: boolean) => unknown };
    create: (config: { doc: string; extensions: unknown[] }) => unknown;
  };
  EditorView: {
    new (config: { state: unknown; parent: HTMLElement }): EditorViewInstance;
    lineWrapping: unknown;
    theme: (styles: Record<string, unknown>, opts: { dark: boolean }) => unknown;
  };
  drawSelection: () => unknown;
  keymap: { of: (value: unknown) => unknown };
  defaultKeymap: unknown;
  history: () => unknown;
  historyKeymap: unknown;
  indentWithTab: unknown;
  syntaxHighlighting: (value: unknown) => unknown;
  HighlightStyle: { define: (value: unknown[]) => unknown };
  bracketMatching: () => unknown;
  foldGutter: () => unknown;
  indentOnInput: () => unknown;
  javascript: (opts: { jsx: boolean; typescript: boolean }) => unknown;
  css: () => unknown;
  html: () => unknown;
  json: () => unknown;
  markdown: () => unknown;
  tags: Record<string, unknown> & {
    special: (value: unknown) => unknown;
    definition: (value: unknown) => unknown;
    function: (value: unknown) => unknown;
  };
};

function getLanguageExtension(filename: string, cm: LoadedCodeMirror) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
    return cm.javascript({ jsx: true, typescript: ext.startsWith("t") });
  }
  if (["css", "scss"].includes(ext)) {
    return cm.css();
  }
  if (ext === FILE_EXTENSIONS.HTML) {
    return cm.html();
  }
  if (ext === FILE_EXTENSIONS.JSON) {
    return cm.json();
  }
  if (["md", "mdx"].includes(ext)) {
    return cm.markdown();
  }
  return [];
}

function createPremiumHighlightStyle(cm: LoadedCodeMirror) {
  const t = cm.tags;
  return cm.HighlightStyle.define([
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
}

function createPremiumEditorTheme(cm: LoadedCodeMirror) {
  return cm.EditorView.theme(
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
}

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
  const viewRef = useRef<EditorViewInstance | null>(null);

  const cmRef = useRef<LoadedCodeMirror | null>(null);
  const languageCompartmentRef = useRef<{
    reconfigure: (value: unknown) => unknown;
  } | null>(null);
  const readOnlyCompartmentRef = useRef<{
    reconfigure: (value: unknown) => unknown;
  } | null>(null);

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

    let isCancelled = false;

    const initEditor = async () => {
      const [
        stateMod,
        viewMod,
        commandsMod,
        languageMod,
        jsMod,
        cssMod,
        htmlMod,
        jsonMod,
        markdownMod,
        lezerMod,
      ] = await Promise.all([
        import("@codemirror/state"),
        import("@codemirror/view"),
        import("@codemirror/commands"),
        import("@codemirror/language"),
        import("@codemirror/lang-javascript"),
        import("@codemirror/lang-css"),
        import("@codemirror/lang-html"),
        import("@codemirror/lang-json"),
        import("@codemirror/lang-markdown"),
        import("@lezer/highlight"),
      ]);

      if (isCancelled || !containerRef.current) return;

      const cm = {
        Compartment: stateMod.Compartment,
        EditorState: stateMod.EditorState,
        EditorView: viewMod.EditorView,
        drawSelection: viewMod.drawSelection,
        keymap: viewMod.keymap,
        defaultKeymap: commandsMod.defaultKeymap,
        history: commandsMod.history,
        historyKeymap: commandsMod.historyKeymap,
        indentWithTab: commandsMod.indentWithTab,
        syntaxHighlighting: languageMod.syntaxHighlighting,
        HighlightStyle: languageMod.HighlightStyle,
        bracketMatching: languageMod.bracketMatching,
        foldGutter: languageMod.foldGutter,
        indentOnInput: languageMod.indentOnInput,
        javascript: jsMod.javascript,
        css: cssMod.css,
        html: htmlMod.html,
        json: jsonMod.json,
        markdown: markdownMod.markdown,
        tags: lezerMod.tags,
      } as unknown as LoadedCodeMirror;

      cmRef.current = cm;

      const languageCompartment = new cm.Compartment();
      const themeCompartment = new cm.Compartment();
      const readOnlyCompartment = new cm.Compartment();

      languageCompartmentRef.current = languageCompartment;
      readOnlyCompartmentRef.current = readOnlyCompartment;

      const premiumHighlightStyle = createPremiumHighlightStyle(cm);
      const premiumEditorTheme = createPremiumEditorTheme(cm);

      const extensions = [
        cm.history(),
        cm.drawSelection(),
        cm.EditorState.allowMultipleSelections.of(true),
        cm.indentOnInput(),
        cm.bracketMatching(),
        cm.foldGutter(),
        cm.keymap.of(cm.defaultKeymap),
        cm.keymap.of(cm.historyKeymap),
        cm.keymap.of([cm.indentWithTab]),
        languageCompartment.of(getLanguageExtension(initialFilenameRef.current, cm)),
        cm.syntaxHighlighting(premiumHighlightStyle),
        themeCompartment.of([premiumEditorTheme]),
        cm.EditorView.lineWrapping,
        readOnlyCompartment.of(cm.EditorState.readOnly.of(initialReadOnlyRef.current)),
      ];

      const state = cm.EditorState.create({
        doc: initialCodeRef.current,
        extensions,
      });

      viewRef.current = new cm.EditorView({
        state,
        parent: containerRef.current,
      });
    };

    void initEditor();

    return () => {
      isCancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current || !cmRef.current || !languageCompartmentRef.current) return;

    viewRef.current.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        getLanguageExtension(filename, cmRef.current),
      ),
    });
  }, [filename]);

  useEffect(() => {
    if (!viewRef.current || !cmRef.current || !readOnlyCompartmentRef.current) return;

    viewRef.current.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(
        cmRef.current.EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  return (
    <div className={cn("relative h-full w-full group/editor", className)}>
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      <AnimatePresence mode="wait">
        {isStreaming ? (
          <m.div
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
          </m.div>
        ) : buildStatus === BuildStatus.QUEUED ? (
          <m.div
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
          </m.div>
        ) : buildStatus === BuildStatus.BUILDING ? (
          <m.div
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
          </m.div>
        ) : buildStatus === BuildStatus.FAILED ? (
          <m.div
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
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
