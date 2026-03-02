"use client";

import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { m, AnimatePresence } from "motion/react";
import { Search, FileCode, Edit3, Terminal, CheckCircle2, User, LoaderIcon } from "lucide-react";
import { useTabVisibility } from "@edward/ui/hooks/useTabVisibility";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";

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
    const parts = useMemo(() => {
        const rawParts = text.split(/(\[.*?\])/);
        const seen = new Map<string, number>();

        return rawParts.map((part) => {
            const count = (seen.get(part) ?? 0) + 1;
            seen.set(part, count);
            return {
                part,
                key: `${part}-${count}`,
            };
        });
    }, [text]);

    return (
        <span className="font-mono text-[10px] text-foreground/60 flex-1 truncate">
            {parts.map(({ part, key }) => {
                const isHighlight = part.startsWith('[') && part.endsWith(']');
                return (
                    <span
                        key={key}
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
        <m.div
            layout
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                mass: 0.8
            }}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/5 my-1 backdrop-blur-sm"
        >
            <div className="p-1 rounded-md bg-primary/10">
                <Icon className="w-3 h-3 text-primary/70" />
            </div>

            <HighlightedText text={call.context} />

            {call.status === ToolCallStatus.RUNNING ? (
                <LoaderIcon className="w-2.5 h-2.5 text-primary/30 animate-spin" />
            ) : (
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500/60" />
            )}
        </m.div>
    );
});
ToolCallUI.displayName = "ToolCallUI";

const SEQUENCE = [
    { delay: 800, next: 1 }, // User message appear
    { delay: 1000, next: 1.5 }, // Bot "typing" starts
    { delay: 1500, next: 2 }, // Analyzing
    { delay: 1000, next: 3 }, // Generating
    { delay: 1200, next: 4 }, // Assistant message
    { delay: 8000, next: 0 }  // Wait and then Fade Out (Reset)
] as const;
const TYPING_DOT_DELAYS = [0, 0.2, 0.4] as const;

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
        <div className="absolute inset-0 bg-[#0a0a0a] select-none p-4 pt-8 overflow-hidden flex flex-col">
            <div className="flex-1 flex flex-col space-y-4 max-w-sm mx-auto w-full relative transition-all duration-700 group-hover:scale-[1.02]">
                <AnimatePresence mode="popLayout" initial={false}>
                    {step >= 1 && (
                        <m.div
                            key="user"
                            layout
                            initial={{ opacity: 0, scale: 0.8, y: 20, originX: 1 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                            transition={{
                                type: "spring",
                                stiffness: 350,
                                damping: 25,
                                mass: 0.8
                            }}
                            className="flex flex-row-reverse items-start gap-2.5 self-end"
                        >
                            <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                <User className="w-4 h-4 text-foreground/40" />
                            </div>
                            <div className="relative bg-[#1c1c1e] border border-white/5 rounded-[20px] p-3.5 mt-1.5 text-[13px] text-foreground/90 leading-snug shadow-lg max-w-[85%]">
                                {data.user}
                            </div>
                        </m.div>
                    )}

                    {step >= 1.5 && (
                        <m.div
                            key="agent"
                            layout
                            initial={{ opacity: 0, scale: 0.8, y: 30, originX: 0 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, delay: 0.05 } }}
                            transition={{
                                type: "spring",
                                stiffness: 350,
                                damping: 25,
                                mass: 1,
                                delay: 0.1
                            }}
                            className="flex items-start gap-2.5 w-full"
                        >
                            <EdwardLogo size={30} className="rounded-full border border-white/20 ring-1 ring-white/5" />
                            <div className="flex-1 space-y-2.5">
                                {step === 1.5 && (
                                    <m.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-[#1c1c1e] border border-white/5 rounded-[20px] px-4 py-2.5 w-16"
                                    >
                                        <div className="flex gap-1 justify-center">
                                            {TYPING_DOT_DELAYS.map((delay) => (
                                                <m.div
                                                    key={`typing-dot-${delay}`}
                                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                                    transition={{ duration: 1, repeat: Infinity, delay }}
                                                    className="w-1.5 h-1.5 bg-foreground/40 rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </m.div>
                                )}

                                <div className="space-y-1.5">
                                    {data.tools.map((tool, idx) => (
                                        step >= 2 + idx && (
                                            <ToolCallUI key={tool.id} call={tool} />
                                        )
                                    ))}
                                </div>

                                {step >= 4 && (
                                    <m.div
                                        layout
                                        initial={{ opacity: 0, scale: 0.8, originY: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30
                                        }}
                                        className="relative bg-primary/10 border border-primary/20 rounded-[20px] p-4 text-[13px] text-foreground/90 leading-relaxed shadow-lg backdrop-blur-md"
                                    >
                                        {data.assistant}
                                    </m.div>
                                )}
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent pointer-events-none z-20" />
        </div>
    );
});

AgentActivityVisual.displayName = "AgentActivityVisual";
