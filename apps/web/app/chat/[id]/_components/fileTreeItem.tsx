"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileCode } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import type { FileTreeNode } from "./fileTree";

interface FileTreeContextValue {
  activeFilePath: string | null;
  streamingFilePath: string | null;
  onSelect: (path: string) => void;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

function useFileTreeContext(): FileTreeContextValue {
  const value = useContext(FileTreeContext);
  if (!value) {
    throw new Error("useFileTreeContext must be used within FileTreeView");
  }
  return value;
}

interface FileTreeViewProps {
  nodes: FileTreeNode[];
  activeFilePath: string | null;
  streamingFilePath: string | null;
  onSelect: (path: string) => void;
}

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
}

export function FileTreeView({
  nodes,
  activeFilePath,
  streamingFilePath,
  onSelect,
}: FileTreeViewProps) {
  const contextValue = useMemo(
    () => ({ activeFilePath, streamingFilePath, onSelect }),
    [activeFilePath, streamingFilePath, onSelect],
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div className="py-2">
        {nodes.map((node) => (
          <FileTreeItem key={node.path} node={node} depth={0} />
        ))}
      </div>
    </FileTreeContext.Provider>
  );
}

function getFileIconClass(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colors: Record<string, string> = {
    tsx: "text-blue-500",
    ts: "text-blue-500",
    jsx: "text-sky-500",
    js: "text-yellow-500",
    css: "text-pink-500",
    html: "text-orange-500",
    json: "text-yellow-600",
    md: "text-gray-500",
  };

  return colors[ext] || "text-gray-400";
}

export const FileTreeItem = memo(function FileTreeItem({
  node,
  depth,
}: FileTreeItemProps) {
  const { activeFilePath, streamingFilePath, onSelect } = useFileTreeContext();
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isActive = node.path === activeFilePath;
  const isStreaming = node.path === streamingFilePath;
  const isFolder = node.type === "folder";

  const handleClick = useCallback(() => {
    if (isFolder) {
      setIsOpen((prev) => !prev);
      return;
    }

    onSelect(node.path);
  }, [isFolder, onSelect, node.path]);

  return (
    <div className="select-none">
      <motion.button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-all duration-150 rounded-lg",
          isActive
            ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50",
          isStreaming && "bg-emerald-500/10",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
      >
        {isFolder ? (
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="h-3 w-3 text-slate-400" />
          </motion.div>
        ) : (
          <FileCode className={cn("h-3.5 w-3.5 shrink-0", getFileIconClass(node.name))} />
        )}

        <span className="text-[11px] font-medium truncate flex-1">{node.name}</span>

        {isStreaming && (
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.button>

      {isFolder && node.children && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              {node.children.map((child) => (
                <FileTreeItem key={child.path} node={child} depth={depth + 1} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
});
