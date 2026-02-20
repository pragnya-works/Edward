"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, m } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { FileTreeNodeType, type FileTreeNode } from "./fileTree";
import { VscodeFileIcon } from "./vscodeFileIcon";

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
  ancestorGuideDepths: number[];
}

const INDENT_STEP_PX = 14;
const BASE_LEFT_PADDING_PX = 12;
const GUIDE_OFFSET_PX = 6;

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
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            ancestorGuideDepths={[]}
          />
        ))}
      </div>
    </FileTreeContext.Provider>
  );
}

const FileTreeItem = memo(function FileTreeItem({
  node,
  depth,
  ancestorGuideDepths,
}: FileTreeItemProps) {
  const { activeFilePath, streamingFilePath, onSelect } = useFileTreeContext();
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isActive = node.path === activeFilePath;
  const isStreaming = node.path === streamingFilePath;
  const isFolder = node.type === FileTreeNodeType.FOLDER;

  const handleClick = useCallback(() => {
    if (isFolder) {
      setIsOpen((prev) => !prev);
      return;
    }

    onSelect(node.path);
  }, [isFolder, onSelect, node.path]);

  const indentLeft = depth * INDENT_STEP_PX + BASE_LEFT_PADDING_PX;

  return (
    <div className="select-none relative">
      <m.button
        type="button"
        onClick={handleClick}
        className={cn(
          "w-full min-w-0 flex items-center gap-2 px-2 py-1 text-left rounded-none font-sans outline-none transition-colors relative",
          isActive
            ? "bg-workspace-accent/15 text-workspace-foreground before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-workspace-accent"
            : "text-workspace-foreground/80 hover:bg-workspace-hover hover:text-workspace-foreground",
          isStreaming && !isActive && "bg-workspace-accent/10",
        )}
        style={{ paddingLeft: `${indentLeft}px` }}
      >
        {ancestorGuideDepths.length > 0 && (
          <div className="pointer-events-none absolute inset-y-0 left-0">
            {ancestorGuideDepths.map((guideDepth) => (
              <span
                key={`${node.path}-guide-${guideDepth}`}
                className="absolute inset-y-0 w-px bg-workspace-border/55"
                style={{
                  left: `${guideDepth * INDENT_STEP_PX + BASE_LEFT_PADDING_PX + GUIDE_OFFSET_PX}px`,
                }}
              />
            ))}
          </div>
        )}

        {isFolder ? (
          <div className="flex items-center gap-1">
            <m.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "text-workspace-foreground/70",
                isActive && "text-workspace-foreground",
              )}
            >
              <ChevronRight className="h-[14px] w-[14px]" />
            </m.div>
            <VscodeFileIcon path={node.path} isFolder isOpen={isOpen} />
          </div>
        ) : (
          <VscodeFileIcon path={node.path} />
        )}

        <span className="text-[11px] font-medium truncate flex-1 min-w-0">{node.name}</span>

        {isStreaming && (
          <m.div
            className="h-1.5 w-1.5 rounded-full bg-workspace-accent"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </m.button>

      {isFolder && node.children && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden relative"
            >
              <span
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-workspace-border/60"
                style={{
                  left: `${depth * INDENT_STEP_PX + BASE_LEFT_PADDING_PX + GUIDE_OFFSET_PX}px`,
                }}
              />
              {node.children.map((child) => (
                <FileTreeItem
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  ancestorGuideDepths={[...ancestorGuideDepths, depth]}
                />
              ))}
            </m.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
});
