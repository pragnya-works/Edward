"use client";

import { memo, useMemo } from "react";
import { m, useReducedMotion } from "motion/react";
import {
    Loader2,
    Code2,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";
import { FrameworkIcon, detectFramework } from "./frameworkIcons";

const ENTER_KEY = "Enter";
const SPACE_KEY = " ";

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
    const prefersReducedMotion = useReducedMotion();
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

    const framework = useMemo(() => detectFramework(files), [files]);

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
        <m.div
            role="button"
            tabIndex={0}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{
                duration: prefersReducedMotion ? 0 : 0.35,
                ease: [0.23, 1, 0.32, 1],
                layout: { duration: prefersReducedMotion ? 0 : 0.2 },
            }}
            onClick={handleToggle}
            onKeyDown={(e) => {
                if (e.key === ENTER_KEY || e.key === SPACE_KEY) {
                    e.preventDefault();
                    handleToggle();
                }
            }}
            aria-expanded={sandboxOpen}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer backdrop-blur-sm w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200",
                sandboxOpen
                    ? "border-primary/25 text-primary animate-pulse-glow bg-primary/8 dark:bg-primary/5"
                    : "bg-muted/70 dark:bg-white/[0.04] border-border dark:border-white/[0.08] text-foreground/80 hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.07]",
            )}
        >
            <m.div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-500"
                animate={isStreaming && !prefersReducedMotion ? { rotate: 360 } : {}}
                transition={{
                    duration: 2,
                    repeat: isStreaming && !prefersReducedMotion ? Infinity : 0,
                    ease: "linear",
                }}
            >
                {isStreaming ? (
                    <Loader2 className={cn("h-4 w-4 text-primary", !prefersReducedMotion && "animate-spin")} />
                ) : framework ? (
                    <FrameworkIcon framework={framework} />
                ) : (
                    <Code2 className="h-4 w-4 text-primary/70" />
                )}
            </m.div>

            <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-[11px] font-semibold truncate max-w-[220px]">
                    {getButtonText()}
                </span>
                {isStreaming && (
                    <m.span
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                        className="text-[9px] text-primary/70"
                    >
                        {files.length} file{files.length !== 1 ? "s" : ""} streaming
                    </m.span>
                )}
                {!isStreaming && (
                    <span className="text-[9px] text-muted-foreground/70">
                        {previewUrl ? "Build complete" : `${files.length} files in workspace`}
                    </span>
                )}
            </div>
        </m.div>
    );
});
