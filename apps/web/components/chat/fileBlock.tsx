"use client";

import { memo, useMemo } from "react";
import { m } from "motion/react";
import { FileCode, FileText, FileJson, FileImage } from "lucide-react";
import type { StreamedFile } from "@/lib/chatTypes";

interface FileBlockProps {
  file: StreamedFile;
  index?: number;
}

const EXT_COLORS: Record<string, string> = {
  tsx: "bg-sky-500",
  ts: "bg-sky-400",
  jsx: "bg-sky-500",
  js: "bg-amber-400",
  css: "bg-violet-500",
  scss: "bg-violet-400",
  html: "bg-orange-500",
  json: "bg-amber-500",
  md: "bg-emerald-500",
  svg: "bg-pink-400",
  png: "bg-pink-500",
  jpg: "bg-pink-500",
  webp: "bg-pink-500",
};

function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
}

function getExtColor(ext: string): string {
  return EXT_COLORS[ext] || "bg-muted-foreground/50";
}

function getFileIcon(ext: string) {
  const cls = "h-3.5 w-3.5 text-muted-foreground/60 shrink-0";
  switch (ext) {
    case "json":
      return <FileJson className={cls} />;
    case "png":
    case "jpg":
    case "webp":
    case "svg":
    case "gif":
      return <FileImage className={cls} />;
    case "md":
    case "txt":
      return <FileText className={cls} />;
    default:
      return <FileCode className={cls} />;
  }
}

export const FileBlock = memo(function FileBlock({
  file,
  index = 0,
}: FileBlockProps) {
  const ext = useMemo(() => getFileExtension(file.path), [file.path]);
  const fileName = useMemo(() => {
    const parts = file.path.split("/");
    return parts[parts.length - 1] || file.path;
  }, [file.path]);
  const dirPath = useMemo(() => {
    const parts = file.path.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
  }, [file.path]);

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.03, 0.1),
      }}
      className="rounded-lg sm:rounded-xl border border-border/50 overflow-hidden bg-foreground/[0.02] group w-full"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-border/30 bg-foreground/[0.02]">
        <div
          className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${getExtColor(ext)} shrink-0`}
        />
        {getFileIcon(ext)}
        <div className="flex items-center gap-0 min-w-0 flex-1 overflow-hidden">
          {dirPath && (
            <span className="text-[10px] sm:text-[11px] font-mono text-muted-foreground/50 truncate shrink-0">
              {dirPath}
            </span>
          )}
          <span className="text-[10px] sm:text-[11px] font-mono text-muted-foreground/70 font-medium truncate">
            {fileName}
          </span>
        </div>
        {!file.isComplete && (
          <m.div
            className="h-1 sm:h-1.5 w-1 sm:w-1.5 rounded-full bg-sky-400 shrink-0"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {file.content && (
        <div className="max-h-36 sm:max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <pre className="px-2.5 sm:px-3 py-2 sm:py-2.5 text-[10px] sm:text-[11px] leading-[1.5] sm:leading-[1.6] font-mono text-foreground/70 whitespace-pre-wrap break-words overflow-wrap-anywhere">
            {file.content}
          </pre>
        </div>
      )}
    </m.div>
  );
});
