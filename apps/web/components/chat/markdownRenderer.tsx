"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import type { Options } from "react-markdown";
import { CopyButton } from "./copyButton";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MAX_MARKDOWN_RENDER_CHARS = 50_000;
const MARKDOWN_SYNTAX_PATTERN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*|__|~~|`|\[[^\]]*\]\([^)]*\)|\|/;
const CODE_FENCE_PATTERN = /```/;
const REMARK_PLUGINS: NonNullable<Options["remarkPlugins"]> = [remarkGfm];
const EMPTY_REHYPE_PLUGINS: [] = [];

const TYPEOF_STRING = "string";
const TYPEOF_OBJECT = "object";

function isStringNode(node: unknown): node is string {
  return typeof node === TYPEOF_STRING;
}

function isObjectNode(
  node: unknown,
): node is { props?: { children?: React.ReactNode } } {
  return typeof node === TYPEOF_OBJECT && node !== null;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = isStringNode(children) ? children.includes("\n") : false;

    const getTextFromChildren = (nodes: React.ReactNode): string => {
      if (!nodes) return "";
      if (isStringNode(nodes)) return nodes;
      if (Array.isArray(nodes)) return nodes.map(getTextFromChildren).join("");
      if (
        isObjectNode(nodes) &&
        "props" in nodes &&
        nodes.props?.children
      )
        return getTextFromChildren(nodes.props.children);
      return String(nodes);
    };

    const codeContent = getTextFromChildren(children).replace(/\n$/, "");

    if (match || isBlock) {
      return (
        <div className="relative my-4 sm:my-6 rounded-2xl overflow-hidden border border-primary/20 glass w-full">

          <div className="flex items-center justify-between px-4 py-2 bg-primary/10 dark:bg-primary/20 border-b border-primary/10 backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex gap-1.5 mr-2 shrink-0">
                <div className="w-2 h-2 rounded-full bg-rose-500/40" />
                <div className="w-2 h-2 rounded-full bg-amber-500/40" />
                <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
              </div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-primary/60 truncate">
                {match ? match[1] : "code"}
              </span>
            </div>
            <CopyButton content={codeContent} />
          </div>

          <pre className="overflow-x-auto p-3 sm:p-5 no-scrollbar max-w-full">
            <code
              className={`${className || ""} text-[11px] sm:text-[13px] leading-[1.6] sm:leading-[1.8] font-mono block relative whitespace-pre-wrap break-words overflow-wrap-anywhere`}
              {...props}
            >
              {children}
            </code>
          </pre>
        </div>
      );
    }

    return (
      <code
        className="px-1 sm:px-1.5 py-0.5 rounded bg-foreground/[0.08] dark:bg-foreground/[0.07] text-[0.85em] sm:text-[0.88em] font-mono text-foreground font-medium break-words"
        {...props}
      >
        {children}
      </code>
    );
  },

  h1: ({ children, ...props }) => (
    <h1
      className="text-base sm:text-lg font-semibold text-foreground mt-4 sm:mt-5 mb-1.5 sm:mb-2"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-sm sm:text-base font-semibold text-foreground mt-3 sm:mt-4 mb-1 sm:mb-1.5"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-xs sm:text-sm font-semibold text-foreground mt-2.5 sm:mt-3 mb-0.5 sm:mb-1"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-1.5 sm:mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-disc marker:text-muted-foreground/50 dark:marker:text-muted-foreground/30"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-decimal marker:text-muted-foreground/60 dark:marker:text-muted-foreground/40"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-sky-600 dark:text-sky-500 hover:text-sky-500 dark:hover:text-sky-400 underline underline-offset-2 decoration-sky-500/30 transition-colors font-medium break-words"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-sky-500/50 dark:border-sky-500/30 pl-3 sm:pl-4 my-1.5 sm:my-2 text-muted-foreground dark:text-muted-foreground/80 italic font-medium"
      {...props}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-2 sm:my-3 overflow-x-auto rounded-lg border border-border/40 -mx-1 sm:mx-0">
      <table className="w-full text-[11px] sm:text-sm min-w-0" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead
      className="bg-foreground/[0.04] border-b border-border/30"
      {...props}
    >
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-foreground/80 dark:text-muted-foreground/70 uppercase tracking-wider"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-2 sm:px-3 py-1.5 sm:py-2 border-t border-border/20"
      {...props}
    >
      {children}
    </td>
  ),
  hr: (props) => <hr className="my-3 sm:my-4 border-border/30" {...props} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const safeContent = content.length > MAX_MARKDOWN_RENDER_CHARS
    ? content.slice(0, MAX_MARKDOWN_RENDER_CHARS)
    : content;

  const hasMarkdownSyntax = MARKDOWN_SYNTAX_PATTERN.test(safeContent);
  const hasCodeFences = CODE_FENCE_PATTERN.test(safeContent);

  if (!hasMarkdownSyntax) {
    return (
      <div className={`prose-edward leading-inherit text-foreground ${className}`}>
        <p className="m-0 whitespace-pre-wrap break-words">{safeContent}</p>
      </div>
    );
  }

  const rehypePlugins = hasCodeFences ? [rehypeHighlight] : EMPTY_REHYPE_PLUGINS;

  return (
    <div
      className={`prose-edward leading-inherit text-foreground ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
});
