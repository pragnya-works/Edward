"use client";

import React, { memo, useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { cn } from "@edward/ui/lib/utils";

const EXAMPLES = [
    {
        prompt: "A cinematic hero with interactive glass elements",
        code: [
            "<section className=\"relative overflow-hidden\">",
            "  <GlassBackground intensity={0.8} />",
            "  <h1 className=\"text-5xl font-bold\">",
            "    Dream in Digital.",
            "  </h1>",
            "</section>"
        ],
        accent: "text-blue-400"
    },
    {
        prompt: "A minimal analytics suite with stream hooks",
        code: [
            "const Metrics = () => {",
            "  const { stream } = useEdwardStream();",
            "  return (",
            "    <div className=\"flex animate-in\">",
            "      <Chart data={stream} />",
            "    </div>",
            "  )",
            "}"
        ],
        accent: "text-purple-400"
    },
    {
        prompt: "An atmospheric navbar with blur effects",
        code: [
            "export const Nav = () => (",
            "  <nav className=\"backdrop-blur-2xl bg-black/5\">",
            "    <div className=\"flex justify-between px-8\">",
            "      <Logo size=\"sm\" glow />",
            "      <Menu links={data.links} />",
            "    </div>",
            "  </nav>",
            ")"
        ],
        accent: "text-emerald-400"
    }
];

function subscribeToVisibility(callback: () => void) {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
}

function getVisibilitySnapshot() {
    return document.visibilityState === 'visible';
}

function getServerVisibilitySnapshot() {
    return true;
}

function useVisibilityAwareInterval(callback: () => void, delay: number) {
    const savedCallback = useRef(callback);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    
    const isDocumentVisible = useSyncExternalStore(
        subscribeToVisibility,
        getVisibilitySnapshot,
        getServerVisibilitySnapshot
    );
    
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);
    
    useEffect(() => {
        const startInterval = () => {
            if (intervalRef.current) return;
            intervalRef.current = setInterval(() => savedCallback.current(), delay);
        };
        
        const stopInterval = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
        
        if (isDocumentVisible) {
            startInterval();
        } else {
            stopInterval();
        }
        
        return () => stopInterval();
    }, [delay, isDocumentVisible]);
}

const GenerationFlow = memo(function GenerationFlow() {
    const [index, setIndex] = useState(0);

    const handleCycle = useCallback(() => {
        setIndex((prev) => (prev + 1) % EXAMPLES.length);
    }, []);

    useVisibilityAwareInterval(handleCycle, 8000);

    const current = EXAMPLES[index] || EXAMPLES[0];
    if (!current) return null;

    return (
        <AnimatePresence mode="wait">
            <motion.div 
                key={index}
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, filter: "blur(20px)", scale: 1.02, y: -10 }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                className="flex flex-col items-center w-full max-w-xl gap-6 md:gap-8"
            >
                <div className="w-full flex flex-col items-center text-center gap-3">
                    <div className="flex items-center gap-3 opacity-20">
                        <div className="h-px w-6 bg-foreground" />
                        <span className="text-[7px] uppercase font-bold tracking-[0.4em]">USER PROMPT</span>
                        <div className="h-px w-6 bg-foreground" />
                    </div>
                    
                    <TextAnimate 
                        text={current.prompt}
                        animation="fadeIn"
                        by="word"
                        duration={0.6}
                        className="text-sm md:text-lg font-medium text-foreground/80 tracking-tight leading-snug px-4"
                    />
                </div>

                <div className="w-full flex flex-col items-center">
                    <div className="font-mono text-[9px] md:text-[11px] space-y-1 w-full bg-white/[0.02] p-4 md:p-6 rounded-xl border border-white/[0.03] backdrop-blur-3xl shadow-2xl relative">
                        <div className="absolute top-2 right-3 flex gap-1 opacity-20">
                            <div className="w-[3px] h-[3px] rounded-full bg-primary" />
                            <div className="w-[3px] h-[3px] rounded-full bg-primary/20" />
                        </div>

                        {current.code.map((line, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: 5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8 + (i * 0.08), duration: 0.4 }}
                                className={cn(current.accent, "whitespace-pre tracking-tight flex items-start")}
                            >
                                <span className="text-foreground/10 mr-4 select-none text-[8px] w-3 tabular-nums">{i+1}</span>
                                <span className="flex-1 opacity-90">{line}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-6 opacity-[0.08] font-mono text-[6px] tracking-[0.3em]">
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                        SYNC::ACTIVE
                    </span>
                    <span>VECTORS::OPTIMIZED</span>
                </div>
            </motion.div>
        </AnimatePresence>
    );
});

export const AIGenerationVisual = memo(() => {
    return (
        <div className="absolute inset-0 overflow-hidden bg-background select-none">
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none">
                <div className="absolute top-4 left-6 font-mono text-[7px] tracking-[0.5em] uppercase">Phase::Synthesis</div>
                <div className="absolute top-4 right-6 font-mono text-[7px] tracking-[0.5em] uppercase opacity-50">v4.0.2</div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--color-primary)_0%,transparent_40%)] opacity-[0.3]" />
            </div>

            <div className="relative h-full w-full flex flex-col items-center justify-start pt-4 md:pt-6 px-4 overflow-hidden transition-all duration-700 group-hover:scale-[1.03] group-hover:rotate-1">
                <GenerationFlow />
            </div>

            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none z-20" />
        </div>
    );
});

AIGenerationVisual.displayName = "AIGenerationVisual";
