"use client";

import { memo } from "react";
import { m } from "motion/react";
import { Cloud } from "lucide-react";

export const DeployingAnimation = memo(function DeployingAnimation() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 sm:gap-8 opacity-90 dark:opacity-80">
            <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24">
                <m.div
                    animate={{ y: [0, -3, 0], scale: [1, 1.015, 1] }}
                    transition={{ y: { duration: 2.8, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } }}
                    className="relative z-10 text-neutral-600 dark:text-workspace-foreground/60 p-4 sm:p-5 rounded-3xl bg-white/[0.02] border border-white/[0.05] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md"
                >
                    <Cloud className="w-8 h-8 sm:w-10 sm:h-10 fill-neutral-600/15 dark:fill-workspace-foreground/10" strokeWidth={1.6} />
                </m.div>

                <m.div
                    aria-hidden
                    className="absolute inset-[7px] sm:inset-[8px] rounded-full border border-dashed border-neutral-300/60 dark:border-workspace-border/50"
                    animate={{ scale: [0.96, 1.02, 0.96], opacity: [0.3, 0.55, 0.3] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                />

                <m.div
                    className="absolute inset-0 border border-neutral-300 dark:border-workspace-border/40 rounded-full"
                    animate={{ scale: [1, 1.12], opacity: [0.28, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                />

                <div className="absolute bottom-1.5 sm:bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-1">
                    <m.span
                        aria-hidden
                        className="block w-[2px] sm:w-0.5 h-2 sm:h-2.5 rounded-full bg-workspace-accent/50"
                        animate={{ y: [0, -4, -8], opacity: [0, 0.9, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0 }}
                    />
                    <m.span
                        aria-hidden
                        className="block w-[2px] sm:w-0.5 h-2 sm:h-2.5 rounded-full bg-workspace-accent/50"
                        animate={{ y: [0, -4, -8], opacity: [0, 0.9, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0.2 }}
                    />
                    <m.span
                        aria-hidden
                        className="block w-[2px] sm:w-0.5 h-2 sm:h-2.5 rounded-full bg-workspace-accent/50"
                        animate={{ y: [0, -4, -8], opacity: [0, 0.9, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                    />
                </div>
            </div>

            <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 text-neutral-500 dark:text-workspace-foreground/40 text-[8px] sm:text-[10px] uppercase tracking-widest font-mono">
                <Cloud className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                Deploying to Sandbox
            </div>
        </div>
    );
});
