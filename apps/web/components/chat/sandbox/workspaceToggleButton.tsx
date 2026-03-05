"use client";

import { memo, useMemo } from "react";
import { m, useReducedMotion } from "motion/react";
import {
    LoaderIcon,
    Code2,
    Terminal,
    FolderOpen,
    Search,
    FileText,
    GitBranch,
    Package,
    FolderPlus,
    FilePlus,
    Copy,
    Trash2,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/stores/sandbox/hooks";
import { FrameworkIcon, detectFramework } from "@/components/chat/editor/frameworkIcons";
import type { CommandEvent } from "@edward/shared/streamEvents";

interface ProjectButtonProps {
    isStreaming: boolean;
    files: { path: string; content?: string; isComplete?: boolean }[];
    activeFilePath: string | null;
    projectName?: string;
    onBeforeToggle?: () => void;
    command?: CommandEvent | null;
}

const ENTER_KEY = "Enter";
const SPACE_KEY = " ";
const GENERIC_ROOT_SEGMENTS = new Set([
    "src",
    "app",
    "pages",
    "components",
    "lib",
    "public",
    "assets",
    "styles",
]);

function formatCommandLine(command: CommandEvent): string {
    const args = Array.isArray(command.args) ? command.args : [];
    return [command.command, ...args].filter(Boolean).join(" ");
}

function getTargetFromArgs(args: string[]): string | null {
    const target = args.find((arg) => arg && !arg.startsWith("-"));
    if (!target) return null;
    const parts = target.split("/");
    const last = parts[parts.length - 1];
    return last || target;
}

function getCommandActivity(command: CommandEvent): string {
    const args = Array.isArray(command.args) ? command.args : [];
    const target = getTargetFromArgs(args);

    switch (command.command) {
        case "cat":
        case "head":
        case "tail":
        case "wc":
            return target ? `Reading ${target}` : "Reading files";
        case "ls":
        case "find":
            return target && target !== "." ? `Exploring ${target}` : "Exploring workspace";
        case "grep":
            return "Searching project";
        case "pnpm":
        case "npm":
            return "Running package script";
        case "tsc":
            return "Type checking project";
        case "git":
            return "Inspecting git state";
        case "mkdir":
            return target ? `Creating ${target}` : "Creating folder";
        case "touch":
            return target ? `Creating ${target}` : "Creating file";
        case "cp":
            return "Copying files";
        case "mv":
            return "Moving files";
        case "rm":
            return "Removing files";
        case "pwd":
            return "Checking current directory";
        case "date":
            return "Checking system time";
        case "echo":
            return "Echoing command output";
        default:
            return `Running ${command.command}`;
    }
}

function getCommandIcon(command: CommandEvent): LucideIcon {
    switch (command.command) {
        case "cat":
        case "head":
        case "tail":
        case "wc":
            return FileText;
        case "ls":
        case "find":
            return FolderOpen;
        case "grep":
            return Search;
        case "pnpm":
        case "npm":
        case "tsc":
            return Package;
        case "git":
            return GitBranch;
        case "mkdir":
            return FolderPlus;
        case "touch":
            return FilePlus;
        case "cp":
        case "mv":
            return Copy;
        case "rm":
            return Trash2;
        case "pwd":
        case "date":
        case "echo":
        default:
            return Terminal;
    }
}

export const ProjectButton = memo(function ProjectButton({
    isStreaming,
    files,
    activeFilePath,
    projectName: customProjectName,
    onBeforeToggle,
    command = null,
}: ProjectButtonProps) {
    const prefersReducedMotion = useReducedMotion();
    const { isOpen: sandboxOpen, toggleSandbox, previewUrl } = useSandbox();
    const framework = useMemo(() => detectFramework(files), [files]);

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
        const firstSegment = parts[0]?.trim() || "";
        if (
            parts.length > 1 &&
            firstSegment &&
            !GENERIC_ROOT_SEGMENTS.has(firstSegment.toLowerCase())
        ) {
            return firstSegment;
        }
        if (framework === "next") return "Next.js App";
        if (framework === "vite") return "React App";
        if (framework === "javascript") return "JavaScript App";
        return "Workspace";
    }, [files, customProjectName, framework]);
    const commandActivity = useMemo(
        () => (command ? getCommandActivity(command) : null),
        [command],
    );
    const commandLine = useMemo(
        () => (command ? formatCommandLine(command) : null),
        [command],
    );
    const commandIcon = useMemo(
        () => (command ? getCommandIcon(command) : null),
        [command],
    );
    const CommandIcon = commandIcon;
    const showCommandActivity = isStreaming && Boolean(command);

    const getButtonText = () => {
        if (showCommandActivity && commandActivity) {
            return commandActivity;
        }
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
                animate={
                    isStreaming && !showCommandActivity && !prefersReducedMotion
                        ? { rotate: 360 }
                        : {}
                }
                transition={{
                    duration: 2,
                    repeat: isStreaming && !showCommandActivity && !prefersReducedMotion ? Infinity : 0,
                    ease: "linear",
                }}
            >
                {showCommandActivity && CommandIcon ? (
                    <CommandIcon className="h-4 w-4 text-primary" />
                ) : isStreaming ? (
                    <LoaderIcon className={cn("h-4 w-4 text-primary", !prefersReducedMotion && "animate-spin")} />
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
                {showCommandActivity && commandLine ? (
                    <m.span
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                        className="text-[9px] text-primary/70 font-mono truncate max-w-[220px]"
                    >
                        {commandLine}
                    </m.span>
                ) : isStreaming ? (
                    <m.span
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                        className="text-[9px] text-primary/70"
                    >
                        {files.length} file{files.length !== 1 ? "s" : ""} streaming
                    </m.span>
                ) : null}
                {!isStreaming && (
                    <span className="text-[9px] text-muted-foreground/70">
                        {previewUrl ? "Build complete" : `${files.length} files in workspace`}
                    </span>
                )}
            </div>
        </m.div>
    );
});
