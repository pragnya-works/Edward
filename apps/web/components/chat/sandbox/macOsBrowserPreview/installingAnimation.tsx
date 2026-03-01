"use client";

import { memo } from "react";
import { m } from "motion/react";
import { Package, Terminal } from "lucide-react";

export const InstallingAnimation = memo(function InstallingAnimation() {
    return (
        <div className="w-full h-full flex items-center justify-center opacity-90 dark:opacity-80">
            <div className="flex flex-col items-center gap-4 sm:gap-8">
                <m.div
                    animate={{ scale: [1, 1.05, 1], y: [0, -5, 0] }}
                    transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
                    className="relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16"
                >
                    <Package className="w-5 h-5 sm:w-7 sm:h-7 text-neutral-600 dark:text-workspace-foreground/40 absolute z-10" />
                    <m.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, ease: "linear", repeat: Infinity }}
                        className="absolute inset-0"
                    >
                        <svg className="w-12 h-12 sm:w-16 sm:h-16 text-neutral-300 dark:text-workspace-foreground/20" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="48" fill="none" strokeWidth="1.5" stroke="currentColor" strokeDasharray="8 6" />
                        </svg>
                    </m.div>
                </m.div>

                <div className="flex flex-col items-center gap-2 sm:gap-3 w-full max-w-[12rem] sm:max-w-xs overflow-hidden">
                    <div className="space-y-1 sm:space-y-2 font-mono text-[8px] sm:text-[10px] text-neutral-500 dark:text-workspace-foreground/40 flex flex-col items-start w-full opacity-80">
                        <m.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }} className="flex items-center gap-1.5 sm:gap-2 w-full truncate">
                            <span className="text-blue-500 dark:text-workspace-accent/50 shrink-0">{">"}</span> <span className="truncate">fetch https://registry.npmjs.org/</span>
                        </m.div>
                        <m.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }} className="flex items-center gap-1.5 sm:gap-2 w-full truncate">
                            <span className="text-blue-500 dark:text-workspace-accent/50 shrink-0">{">"}</span> <span className="truncate">resolving dependencies...</span>
                        </m.div>
                        <m.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 1.2 }} className="flex items-center gap-1.5 sm:gap-2 w-full truncate">
                            <span className="text-blue-500 dark:text-workspace-accent/50 shrink-0">{">"}</span> <span className="truncate">linking packages</span>
                        </m.div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 text-neutral-500 dark:text-workspace-foreground/40 text-[8px] sm:text-[10px] uppercase tracking-widest font-mono">
                <Terminal className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                Installing Dependencies
            </div>
        </div>
    );
});
