"use client";

import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, FileCode, Edit3, Terminal, CheckCircle2, User, Bot, Loader2 } from "lucide-react";
import { useTabVisibility } from "@/hooks/useTabVisibility";

enum ToolCallKind {
    SEARCH = "search",
    READ = "read",
    EDIT = "edit",
    COMMAND = "command",
}

enum ToolCallStatus {
    RUNNING = "running",
    DONE = "done",
}

interface ToolCall {
    id: string;
    tool: ToolCallKind;
    context: string;
    status: ToolCallStatus;
}

interface ConversationStep {
    user: string;
    tools: ToolCall[];
    assistant: string;
}

const CONVERSATION: ConversationStep[] = [
    {
        user: "Build a responsive analytics dashboard with real-time metrics.",
        tools: [
            { id: "t1", tool: ToolCallKind.SEARCH, context: "locating [packages/ui/charts]", status: ToolCallStatus.DONE },
            { id: "t2", tool: ToolCallKind.READ, context: "analyzing [theme.json]", status: ToolCallStatus.DONE },
            { id: "t3", tool: ToolCallKind.EDIT, context: "generating [dashboard.tsx] +142 lines", status: ToolCallStatus.DONE }
        ],
        assistant: "I've analyzed your project structure and generated a dashboard using your existing chart library. Would you like to add a date range picker?"
    }
];

const TOOL_ICONS = {
    [ToolCallKind.SEARCH]: Search,
    [ToolCallKind.READ]: FileCode,
    [ToolCallKind.EDIT]: Edit3,
    [ToolCallKind.COMMAND]: Terminal
};

const HighlightedText = memo(({ text }: { text: string }) => {
    const parts = useMemo(() => text.split(/(\[.*?\])/), [text]);

    return (
        <span className="font-mono text-[10px] text-foreground/60 flex-1 truncate">
            {parts.map((part, i) => {
                const isHighlight = part.startsWith('[') && part.endsWith(']');
                return (
                    <span
                        key={i}
                        className={isHighlight ? "text-primary/70" : ""}
                    >
                        {part}
                    </span>
                );
            })}
        </span>
    );
});
HighlightedText.displayName = "HighlightedText";

const ToolCallUI = memo(({ call }: { call: ToolCall }) => {
    const Icon = TOOL_ICONS[call.tool];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 my-1"
        >
            <div className="p-1 rounded bg-primary/10">
                <Icon className="w-3 h-3 text-primary/70" />
            </div>

            <HighlightedText text={call.context} />

            {call.status === ToolCallStatus.RUNNING ? (
                <Loader2 className="w-2.5 h-2.5 text-primary/30 animate-spin" />
            ) : (
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500/50" />
            )}
        </motion.div>
    );
});
ToolCallUI.displayName = "ToolCallUI";

const SEQUENCE = [
    { delay: 1000, next: 1 },
    { delay: 800, next: 2 },
    { delay: 1200, next: 3 },
    { delay: 1000, next: 4 },
    { delay: 800, next: 5 },
    { delay: 5000, next: 0 }
] as const;

export const AgentActivityVisual = memo(() => {
    const [step, setStep] = useState(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sequenceIndexRef = useRef(0);
    const isDocumentVisible = useTabVisibility();

    const clearCurrentTimeout = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const runSequence = useCallback(() => {
        const currentSequenceStep = SEQUENCE[sequenceIndexRef.current];
        if (!currentSequenceStep) return;

        clearCurrentTimeout();

        timeoutRef.current = setTimeout(() => {
            setStep(currentSequenceStep.next);
            sequenceIndexRef.current = (sequenceIndexRef.current + 1) % SEQUENCE.length;
            runSequence();
        }, currentSequenceStep.delay);
    }, [clearCurrentTimeout]);

    useEffect(() => {
        if (isDocumentVisible) {
            runSequence();
        } else {
            clearCurrentTimeout();
        }

        return () => clearCurrentTimeout();
    }, [isDocumentVisible, runSequence, clearCurrentTimeout]);

    const data = CONVERSATION[0];
    if (!data) return null;

    return (
        <div className="absolute inset-0 bg-background select-none p-4 pt-6 overflow-hidden flex flex-col">
            <div className="flex-1 space-y-6 max-w-sm mx-auto w-full relative transition-all duration-700 group-hover:scale-105 group-hover:rotate-1">
                <AnimatePresence mode="popLayout">
                    {step >= 1 && (
                        <motion.div
                            key="user"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3"
                        >
                            <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                <User className="w-3.5 h-3.5 text-foreground/40" />
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 md:p-4 text-[10px] md:text-[12px] text-foreground/80 leading-relaxed shadow-sm">
                                {data.user}
                            </div>
                        </motion.div>
                    )}

                    {step >= 2 && (
                        <motion.div
                            key="agent"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 w-full"
                        >
                            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
                                <Bot className="w-3.5 h-3.5 text-primary" />
                            </div>

                            <div className="flex-1 space-y-3">
                                <div className="space-y-1">
                                    {data.tools.map((tool, idx) => (
                                        step >= 2 + idx && (
                                            <ToolCallUI key={tool.id} call={tool} />
                                        )
                                    ))}
                                </div>

                                {step >= 5 && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-[12px] text-foreground/80 leading-relaxed"
                                    >
                                        {data.assistant}
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none z-20" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        </div>
    );
});

AgentActivityVisual.displayName = "AgentActivityVisual";
