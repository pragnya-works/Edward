"use client";

import { memo, useMemo } from "react";
import { motion } from "motion/react";
import {
    Loader2,
    CheckCircle2,
    Code2,
    ExternalLink,
    ChevronRight,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";

interface ProjectButtonProps {
    isStreaming: boolean;
    files: { path: string; content?: string; isComplete?: boolean }[];
    activeFilePath: string | null;
    projectName?: string;
    onBeforeToggle?: () => void;
}

export const ProjectButton = memo(function ProjectButton({
    isStreaming,
    files,
    activeFilePath,
    projectName: customProjectName,
    onBeforeToggle,
}: ProjectButtonProps) {
    const { isOpen: sandboxOpen, toggleSandbox, previewUrl } = useSandbox();

    const activeFile = activeFilePath
        ? files.find((f) => f.path === activeFilePath)
        : null;
    const activeFileName = activeFile ? activeFile.path.split("/").pop() : null;
    const hasFiles = files.length > 0;

    const projectName = useMemo(() => {
        if (customProjectName) return customProjectName;
        if (files.length === 0) return null;
        const firstFile = files[0];
        if (!firstFile) return null;
        const parts = firstFile.path.split("/");
        return parts.length > 1 ? parts[0] : "Project";
    }, [files, customProjectName]);

    const getButtonText = () => {
        if (isStreaming && activeFileName) {
            return `Writing ${activeFileName}...`;
        }
        if (projectName) {
            return projectName;
        }
        return "Workspace";
    };

    if (!hasFiles && !isStreaming) return null;

    const handleToggle = () => {
        onBeforeToggle?.();
        toggleSandbox();
    };

    return (
        <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{
                duration: 0.35,
                ease: [0.23, 1, 0.32, 1],
                layout: { duration: 0.2 },
            }}
            onClick={handleToggle}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer glass w-full",
                sandboxOpen
                    ? "border-primary/40 text-primary animate-pulse-glow bg-primary/5"
                    : "bg-transparent border-border/40 text-foreground/80 hover:text-foreground hover:bg-foreground/[0.02]",
            )}
        >
            <motion.div
                className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500",
                    sandboxOpen
                        ? "bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/20 rotate-12"
                        : "bg-primary/10 dark:bg-primary/20",
                )}
                animate={isStreaming ? { rotate: 360 } : {}}
                transition={{
                    duration: 2,
                    repeat: isStreaming ? Infinity : 0,
                    ease: "linear",
                }}
            >
                {isStreaming ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : previewUrl ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <Code2 className="h-4 w-4 text-primary/70" />
                )}
            </motion.div>

            <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-[11px] font-semibold truncate max-w-[220px]">
                    {getButtonText()}
                </span>
                {isStreaming && (
                    <motion.span
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[9px] text-primary/70"
                    >
                        {files.length} file{files.length !== 1 ? "s" : ""} streaming
                    </motion.span>
                )}
                {!isStreaming && (
                    <span className="text-[9px] text-muted-foreground/70">
                        {previewUrl ? "Build complete" : `${files.length} files in workspace`}
                    </span>
                )}
            </div>

            {previewUrl && !isStreaming && (
                <ExternalLink
                    className="h-3.5 w-3.5 text-emerald-500/60 hover:text-emerald-500 ml-1 shrink-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(previewUrl, "_blank");
                    }}
                />
            )}
            <ChevronRight
                className={cn(
                    "h-3.5 w-3.5 ml-auto transition-transform duration-200 shrink-0",
                    sandboxOpen && "rotate-90",
                )}
            />
        </motion.button>
    );
});
