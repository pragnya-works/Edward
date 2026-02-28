"use client";

import React, { memo } from "react";
import { m } from "motion/react";
import { GitHub } from "@edward/ui/components/icons/github";

export const GitHubSyncVisual = memo(() => {
    return (
        <div className="absolute inset-0 bg-[#020202] overflow-hidden select-none">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03)_0%,transparent_50%)]" />
            </div>

            <div className="relative h-full w-full flex flex-col items-center justify-start pt-6 md:pt-8">
                <m.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1, ease: [0.19, 1, 0.22, 1] }}
                    className="relative group shrink-0"
                >
                    <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full scale-150 opacity-50 group-hover:opacity-80 transition-opacity duration-1000" />

                    <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-[2.5rem] bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.1] flex items-center justify-center backdrop-blur-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden">
                        <m.div
                            animate={{ x: ["-200%", "200%"] }}
                            transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
                            className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent -skew-x-12"
                        />

                        <m.div
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <GitHub className="w-12 h-12 md:w-16 md:h-16 text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                        </m.div>

                        <div className="absolute inset-0 rounded-[2.5rem] border border-white/[0.05] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]" />
                    </div>
                </m.div>

                <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 1 }}
                    className="mt-6 flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3.5 py-1.5 rounded-full backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-[background-color,border-color] hover:bg-white/[0.06] hover:border-white/20 shrink-0"
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse" />
                    <span className="text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-white/80">Continuous Sync</span>
                </m.div>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none z-20" />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-background/40 backdrop-blur-[2px] pointer-events-none z-10" />
        </div>
    );
});

GitHubSyncVisual.displayName = "GitHubSyncVisual";
