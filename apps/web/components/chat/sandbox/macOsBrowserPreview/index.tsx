"use client";

import { memo, type ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@edward/ui/lib/utils";
import { GeneratingAnimation } from "@/components/chat/sandbox/macOsBrowserPreview/generatingAnimation";
import { InstallingAnimation } from "@/components/chat/sandbox/macOsBrowserPreview/installingAnimation";
import { DeployingAnimation } from "@/components/chat/sandbox/macOsBrowserPreview/deployingAnimation";

export const MAC_OS_PREVIEW_STATE = {
    GENERATING: "generating",
    INSTALLING: "installing",
    DEPLOYING: "deploying",
} as const;

export type MacOsPreviewState =
    (typeof MAC_OS_PREVIEW_STATE)[keyof typeof MAC_OS_PREVIEW_STATE];

const animationByState: Record<MacOsPreviewState, ReactNode> = {
    [MAC_OS_PREVIEW_STATE.GENERATING]: <GeneratingAnimation />,
    [MAC_OS_PREVIEW_STATE.INSTALLING]: <InstallingAnimation />,
    [MAC_OS_PREVIEW_STATE.DEPLOYING]: <DeployingAnimation />,
};

interface MacOsBrowserPreviewProps {
    state: MacOsPreviewState;
    className?: string;
    size?: "default" | "sm";
}

export const MacOsBrowserPreview = memo(function MacOsBrowserPreview({
    state,
    className,
    size = "default",
}: MacOsBrowserPreviewProps) {
    return (
        <div className={cn("flex-1 p-3 sm:p-6 md:p-12 flex items-center justify-center bg-workspace-bg", className)}>
            <m.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={cn(
                    "w-full aspect-[4/3] sm:aspect-[16/10] bg-white dark:bg-workspace-sidebar border border-neutral-200 dark:border-workspace-border/50 shadow-sm dark:shadow-xl rounded-xl overflow-hidden flex flex-col relative",
                    size === "sm" ? "max-w-[420px] max-h-[320px]" : "max-w-2xl max-h-[400px]"
                )}
            >
                <div className="relative h-10 border-b border-neutral-200 dark:border-workspace-border flex items-center px-3 sm:px-4 shrink-0 bg-neutral-50 dark:bg-workspace-sidebar">
                    <div className="relative z-10 flex gap-1.5 sm:gap-2 isolate">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-neutral-300 dark:bg-workspace-foreground/20" />
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-neutral-300 dark:bg-workspace-foreground/20" />
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-neutral-300 dark:bg-workspace-foreground/20" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-24 sm:w-32 md:w-48 h-4 sm:h-5 rounded-md bg-white dark:bg-workspace-bg/50 border border-neutral-200 dark:border-workspace-border/40" />
                    </div>
                </div>

                <div className="flex-1 relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-white dark:bg-workspace-bg/50">
                    {animationByState[state]}
                </div>
            </m.div>
        </div>
    );
});
