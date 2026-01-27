"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@edward/ui/lib/utils";

const variants = {
    fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 } },
    slideUp: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } },
    slideRight: { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 } },
    scaleUp: { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } },
};

function BrowserHeader() {
    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
            <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-400/20 border border-red-400/30" />
                <div className="h-2 w-2 rounded-full bg-yellow-400/20 border border-yellow-400/30" />
                <div className="h-2 w-2 rounded-full bg-green-400/20 border border-green-400/30" />
            </div>
            <div className="h-2 w-32 rounded-full bg-muted-foreground/10 border border-border/50" />
            <div className="w-8" />
        </div>
    );
}

function Sidebar() {
    return (
        <div className="w-10 md:w-12 border-r border-border bg-muted/5 p-3 space-y-4 shrink-0">
            {[1, 2, 3, 4].map((i) => (
                <div 
                    key={i} 
                    className={cn(
                        "h-1.5 w-full rounded-full", 
                        i === 1 ? 'bg-primary/20' : 'bg-muted-foreground/10'
                    )} 
                />
            ))}
        </div>
    );
}

function SkeletonUI() {
    return (
        <div className="flex-1 p-6 space-y-6">
            <div className="space-y-3">
                <div className="h-6 w-1/2 rounded-lg bg-muted/30 animate-pulse" />
                <div className="h-3 w-3/4 rounded-md bg-muted/10 animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="h-20 rounded-xl bg-muted/5 border border-border/20 animate-pulse" />
                <div className="h-20 rounded-xl bg-muted/5 border border-border/20 animate-pulse" />
            </div>
            <div className="h-24 w-full rounded-xl bg-primary/5 border border-primary/10 relative overflow-hidden">
                <motion.div 
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent"
                />
            </div>
        </div>
    );
}

function DashboardLayout() {
    return (
        <div className="flex-1 p-5 md:p-6 space-y-5 overflow-hidden">
            <div className="flex items-center justify-between">
                <motion.div 
                    variants={variants.slideRight}
                    initial="initial"
                    animate="animate"
                    className="space-y-1"
                >
                    <h3 className="text-sm md:text-base font-bold text-foreground">Cloud Analytics</h3>
                    <p className="text-[10px] text-muted-foreground">Real-time infrastructure health</p>
                </motion.div>
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
            </div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="h-28 md:h-32 w-full rounded-xl bg-gradient-to-br from-primary/10 via-background to-background border border-border p-4 relative"
            >
                <div className="flex items-end gap-1.5 h-full pt-8">
                    {[50, 80, 45, 95, 70, 85, 60, 90, 55, 75].map((h, i) => (
                        <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.03, ease: [0.33, 1, 0.68, 1] }}
                            className="flex-1 bg-primary/40 rounded-t-[2px]"
                        />
                    ))}
                </div>
                <div className="absolute top-4 left-4">
                    <span className="text-xl font-bold font-mono tracking-tighter text-foreground">$12.4k</span>
                </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-3">
                {[1, 2].map((i) => (
                    <motion.div 
                        key={i}
                        variants={variants.slideUp}
                        initial="initial"
                        animate="animate"
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="p-3 rounded-xl bg-card border border-border shadow-sm space-y-2"
                    >
                        <div className="flex gap-2">
                            <div className="w-4 h-4 rounded bg-primary/20" />
                            <div className="h-1.5 w-12 rounded bg-muted mt-1.5" />
                        </div>
                        <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: i === 1 ? "70%" : "45%" }}
                                transition={{ duration: 1, delay: 0.8 }}
                                className="h-full bg-primary/60"
                            />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function MarketingLayout() {
    return (
        <div className="flex-1 p-6 space-y-6 overflow-hidden flex flex-col items-center">
            <motion.div 
                variants={variants.scaleUp}
                initial="initial"
                animate="animate"
                className="text-center space-y-4"
            >
                <div className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[7px] font-bold text-emerald-500 uppercase tracking-widest">
                    New Feature
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground leading-[1.2]">
                    Design at the speed <br /> of <span className="text-primary underline decoration-primary/30 underline-offset-4">thought</span>
                </h3>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full grid grid-cols-3 gap-2 px-2"
            >
                {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-[4/5] rounded-lg bg-card border border-border shadow-sm flex flex-col p-2 space-y-2">
                        <div className="flex-1 rounded-md bg-muted/30" />
                        <div className="h-1 w-3/4 rounded bg-muted/50" />
                    </div>
                ))}
            </motion.div>

            <motion.div
                variants={variants.fadeIn}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.6 }}
                className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shadow-lg shadow-primary/20"
            >
                Join the waitlist
            </motion.div>
        </div>
    );
}

function KanbanLayout() {
    return (
        <div className="flex-1 p-5 md:p-6 space-y-5 overflow-hidden">
            <div className="flex items-center justify-between">
                <h3 className="text-xs md:text-sm font-bold">Project Sprint</h3>
                <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-5 h-5 rounded-full border border-background bg-muted" />
                    ))}
                </div>
            </div>

            <div className="flex gap-4 h-full">
                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">In Progress</span>
                    </div>
                    {[1, 2].map(i => (
                        <motion.div 
                            key={i}
                            variants={variants.slideRight}
                            initial="initial"
                            animate="animate"
                            transition={{ delay: i * 0.1 }}
                            className="p-3 rounded-xl bg-card border border-border shadow-sm space-y-2"
                        >
                            <div className="h-1 w-full rounded bg-muted/50" />
                            <div className="h-1 w-2/3 rounded bg-muted/30" />
                            <div className="flex justify-between items-center pt-1">
                                <div className="h-3 w-8 rounded bg-primary/10 border border-primary/20" />
                                <div className="w-3 h-3 rounded-full bg-muted" />
                            </div>
                        </motion.div>
                    ))}
                </div>
                <div className="flex-1 space-y-3 opacity-40">
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">Done</span>
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-border shadow-sm space-y-2">
                        <div className="h-1 w-full rounded bg-muted/50" />
                        <div className="h-3 w-8 rounded bg-emerald-500/10" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SettingsLayout() {
    return (
        <div className="flex-1 p-5 md:p-6 space-y-5 overflow-hidden">
            <div className="space-y-1 pb-2 border-b border-border/50">
                <h3 className="text-sm font-bold">Workspace Settings</h3>
                <p className="text-[9px] text-muted-foreground">Manage your organization preferences</p>
            </div>

            <div className="space-y-4 pt-2">
                {[1, 2, 3].map(i => (
                    <motion.div 
                        key={i}
                        variants={variants.slideUp}
                        initial="initial"
                        animate="animate"
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-muted/30 border border-border" />
                            <div className="space-y-1">
                                <div className="h-2 w-20 rounded bg-muted/60" />
                                <div className="h-1.5 w-12 rounded bg-muted/30" />
                            </div>
                        </div>
                        <div className={cn(
                            "w-8 h-4 rounded-full border border-border relative",
                            i === 1 ? 'bg-primary/20' : 'bg-muted/30'
                        )}>
                            <div className={cn(
                                "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                                i === 1 ? 'right-0.5 bg-primary' : 'left-0.5 bg-muted-foreground/30'
                            )} />
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="mt-8 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <div className="h-1.5 w-16 rounded bg-primary/20" />
                </div>
                <div className="w-12 h-4 rounded bg-primary/10 border border-primary/20" />
            </div>
        </div>
    );
}

export function InstantPreviewVisual() {
    const [index, setIndex] = useState(0);
    const [isGenerating, setIsGenerating] = useState(true);

    const layouts = useMemo(() => [
        <DashboardLayout key="dashboard" />,
        <MarketingLayout key="marketing" />,
        <KanbanLayout key="kanban" />,
        <SettingsLayout key="settings" />
    ], []);

    useEffect(() => {
        const cycleInterval = setInterval(() => {
            setIsGenerating(true);
            setTimeout(() => {
                setIndex((prev) => (prev + 1) % layouts.length);
                setIsGenerating(false);
            }, 1200);
        }, 6000);

        const initialTimer = setTimeout(() => setIsGenerating(false), 1200);

        return () => {
            clearInterval(cycleInterval);
            clearTimeout(initialTimer);
        };
    }, [layouts.length]);

    return (
        <div className="absolute inset-0 flex justify-center opacity-95 pointer-events-none group-hover:scale-[1.03] transition-transform duration-[1.5s] ease-out pt-4">
            <div className="h-[75%] md:h-[70%] w-[85%] rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.4)] relative top-4 transition-all duration-700 overflow-hidden flex flex-col antialiased">
                <BrowserHeader />
                <div className="flex-1 flex overflow-hidden">
                    <Sidebar />
                    <AnimatePresence mode="wait">
                        {isGenerating ? (
                            <motion.div
                                key="skeleton"
                                variants={variants.fadeIn}
                                initial="initial"
                                animate="animate"
                                exit={{ 
                                    opacity: 0,
                                    filter: "blur(12px)",
                                    scale: 1.05,
                                    transition: { duration: 0.3 }
                                }}
                                className="flex-1 h-full relative"
                            >
                                <SkeletonUI />
                                <motion.div 
                                    animate={{ top: ["0%", "100%"] }}
                                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_rgba(var(--color-primary),0.3)] z-20"
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={`layout-${index}`}
                                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                                className="flex-1 h-full bg-background/20"
                            >
                                {layouts[index]}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                
                <div className="absolute inset-0 pointer-events-none border border-white/[0.03] rounded-2xl" />
            </div>
        </div>
    );
}