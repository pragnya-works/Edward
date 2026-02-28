"use client";

import React, { memo, useState, useCallback, useMemo, useEffect } from "react";
import { m, AnimatePresence } from "motion/react";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { cn } from "@edward/ui/lib/utils";
import { useVisibilityAwareInterval } from "@edward/ui/hooks/useVisibilityAwareInterval";
import { OpenAI } from "@edward/ui/components/ui/openAi";
import { Gemini } from "@edward/ui/components/ui/gemini";
import { EDWARD_LOGO_URL } from "@edward/ui/components/brand/edwardLogo";
import Image from "next/image";

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

const OPENAI_PATH = "M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z";
const GEMINI_PATH = "M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z";

type FlowState = "SELECT" | "FUSION" | "GENERATE";
type AiModel = "openai" | "gemini";

const AiSelectFlow = memo(({ onSelect }: { onSelect: (ai: AiModel) => void }) => {
    const [hovered, setHovered] = useState<AiModel | null>(null);

    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 md:gap-8 z-10 pointer-events-auto -mt-20 md:-mt-16"
        >
            <m.h3
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-[10px] md:text-sm font-bold tracking-[0.2em] uppercase text-foreground/50 text-center"
            >
                Choose Intelligence
            </m.h3>

            <div className="flex items-center justify-center gap-6 md:gap-12 w-full max-w-md px-6">
                <button
                    onClick={() => onSelect("openai")}
                    onMouseEnter={() => setHovered("openai")}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                        "relative group flex flex-col items-center justify-center p-4 md:p-6 rounded-2xl transition-all duration-500",
                        "bg-white/[0.03] border shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] hover:bg-white/[0.06] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_8px_30px_rgba(0,0,0,0.12)]",
                        hovered === "openai" ? "border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_0_40px_rgba(255,255,255,0.08)] scale-105" : "border-white/[0.08]",
                        hovered === "gemini" ? "opacity-30 grayscale scale-95" : ""
                    )}
                >
                    <div className="relative w-10 h-10 md:w-14 md:h-14">
                        <m.svg viewBox="0 0 256 260" className="absolute inset-0 w-full h-full text-foreground/60 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                            <m.path
                                d={OPENAI_PATH}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.8, ease: "easeInOut" }}
                            />
                        </m.svg>
                        <m.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.8, duration: 0.5 }}
                            className="absolute inset-0 transition-all duration-300"
                        >
                            <OpenAI className="w-full h-full text-foreground drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                        </m.div>
                    </div>
                    <span className={cn(
                        "absolute -bottom-6 text-[9px] font-bold tracking-[0.2em] uppercase transition-all duration-300",
                        hovered === "openai" ? "text-foreground opacity-100 translate-y-0" : "text-foreground/0 opacity-0 -translate-y-2"
                    )}>
                        OpenAI
                    </span>
                </button>
                <button
                    onClick={() => onSelect("gemini")}
                    onMouseEnter={() => setHovered("gemini")}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                        "relative group flex flex-col items-center justify-center p-4 md:p-6 rounded-2xl transition-all duration-500",
                        "bg-white/[0.03] border shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] hover:bg-white/[0.06] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_8px_30px_rgba(0,0,0,0.12)]",
                        hovered === "gemini" ? "border-[#3186FF]/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_0_40px_rgba(49,134,255,0.15)] scale-105" : "border-white/[0.08]",
                        hovered === "openai" ? "opacity-30 grayscale scale-95" : ""
                    )}
                >
                    <div className="relative w-10 h-10 md:w-14 md:h-14">
                        <m.svg viewBox="0 0 296 298" className="absolute inset-0 w-full h-full text-[#3186FF]/70 drop-shadow-[0_0_8px_rgba(49,134,255,0.6)]">
                            <m.path
                                d={GEMINI_PATH}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.8, ease: "easeInOut" }}
                            />
                        </m.svg>
                        <m.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.8, duration: 0.5 }}
                            className="absolute inset-0 transition-all duration-300"
                        >
                            <Gemini className="w-full h-full drop-shadow-[0_0_15px_rgba(49,134,255,0.4)]" />
                        </m.div>
                    </div>
                    <span className={cn(
                        "absolute -bottom-6 text-[9px] font-bold tracking-[0.2em] uppercase transition-all duration-300",
                        hovered === "gemini" ? "text-[#3186FF] opacity-100 translate-y-0" : "text-[#3186FF]/0 opacity-0 -translate-y-2"
                    )}>
                        Gemini
                    </span>
                </button>
            </div>
        </m.div>
    );
});
AiSelectFlow.displayName = "AiSelectFlow";

const AiFusionFlow = memo(({ selectedAi, onComplete }: { selectedAi: AiModel, onComplete: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onComplete();
        }, 2500); // Sequence duration
        return () => clearTimeout(timer);
    }, [onComplete]);

    const isGemini = selectedAi === "gemini";
    const blurColor = isGemini ? "rgba(49,134,255,0.3)" : "rgba(255,255,255,0.15)";

    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            className="absolute inset-0 flex items-center justify-center z-40 overflow-hidden pointer-events-none -mt-20 md:-mt-16"
        >
            <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 3, times: [0, 0.4, 1] }}
                className="absolute inset-0 bg-background/90 z-0"
            />

            <m.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 3, 8], opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, ease: "easeIn" }}
                className="absolute w-24 h-24 md:w-32 md:h-32 rounded-full z-10 blur-3xl mix-blend-screen"
                style={{ backgroundColor: blurColor }}
            />

            <m.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{
                    scale: [0.5, 1.2, 0.1],
                    opacity: [0, 1, 0],
                    filter: ["blur(4px)", "blur(0px)", "blur(10px)"],
                    rotate: [0, 0, 180]
                }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="absolute z-20 w-16 h-16 md:w-20 md:h-20"
            >
                {isGemini ? <Gemini className="w-full h-full" /> : <OpenAI className="w-full h-full text-foreground" />}
            </m.div>
            <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 1, 0] }}
                transition={{ duration: 0.8, times: [0, 0.3, 0.5, 1], delay: 1 }}
                className="absolute inset-0 bg-white z-50 mix-blend-overlay"
            />
            <m.div
                initial={{ scale: 0.5, opacity: 0, filter: "blur(8px)" }}
                animate={{ scale: [0.5, 1.08, 1], opacity: [0, 1, 1], filter: ["blur(8px)", "blur(0px)", "blur(0px)"] }}
                transition={{ duration: 1.2, delay: 1.2, ease: "easeOut" }}
                className="absolute z-30 w-20 h-20 md:w-24 md:h-24 rounded-2xl shadow-[0_0_80px_rgba(255,255,255,0.25)] overflow-hidden"
            >
                <Image
                    src={EDWARD_LOGO_URL}
                    alt="Edward"
                    fill
                    sizes="(max-width: 768px) 5rem, 6rem"
                    className="object-cover"
                />
            </m.div>
        </m.div>
    );
});
AiFusionFlow.displayName = "AiFusionFlow";


const GenerationFlow = memo(function GenerationFlow({ selectedAi }: { selectedAi: AiModel }) {
    const [index, setIndex] = useState(0);

    const handleCycle = useCallback(() => {
        setIndex((prev) => (prev + 1) % EXAMPLES.length);
    }, []);

    useVisibilityAwareInterval(handleCycle, 5000);

    const current = EXAMPLES[index] || EXAMPLES[0];
    const keyedCodeLines = useMemo(() => {
        const seen = new Map<string, number>();
        return (current?.code ?? []).map((line) => {
            const count = (seen.get(line) ?? 0) + 1;
            seen.set(line, count);
            return {
                line,
                key: `code-line-${line}-${count}`,
            };
        });
    }, [current]);
    if (!current) return null;

    return (
        <AnimatePresence mode="wait">
            <m.div
                key={current.prompt}
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, filter: "blur(8px)", scale: 1.02, y: -10 }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                className="flex flex-col items-center w-full max-w-xl gap-3 md:gap-4"
            >
                <div className="w-full flex flex-col items-center text-center gap-1 md:gap-2">
                    <m.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-10 h-10 md:w-12 md:h-12 mb-1 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(255,255,255,0.1)] relative"
                    >
                        <Image src={EDWARD_LOGO_URL} alt="Edward generating" fill sizes="(max-width: 768px) 2.5rem, 3rem" className="object-cover" />
                        <div className="absolute inset-0 bg-primary/20 animate-pulse mix-blend-overlay" />
                    </m.div>

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

                <div className="w-full flex flex-col items-center mt-2">
                    <div className="font-mono text-[9px] md:text-[11px] space-y-1 w-full bg-white/[0.02] p-3 md:p-4 rounded-xl border border-white/[0.03] backdrop-blur-3xl shadow-2xl relative">
                        <div className="absolute top-2 right-3 flex gap-1 opacity-20">
                            <div className="w-[3px] h-[3px] rounded-full bg-primary" />
                            <div className="w-[3px] h-[3px] rounded-full bg-primary/20" />
                        </div>

                        {keyedCodeLines.map(({ line, key }, lineIndex) => (
                            <m.div
                                key={key}
                                initial={{ opacity: 0, x: 5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8 + (lineIndex * 0.08), duration: 0.4 }}
                                className={cn(current.accent, "whitespace-pre tracking-tight flex items-start")}
                            >
                                <span className="text-foreground/10 mr-4 select-none text-[8px] w-3 tabular-nums">{lineIndex + 1}</span>
                                <span className="flex-1 opacity-90">{line}</span>
                            </m.div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-6 opacity-[0.08] font-mono text-[6px] tracking-[0.3em] uppercase">
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                        {selectedAi}::ACTIVE
                    </span>
                    <span>VECTORS::OPTIMIZED</span>
                </div>
            </m.div>
        </AnimatePresence>
    );
});

export const AIGenerationVisual = memo(() => {
    const [flowState, setFlowState] = useState<FlowState>("SELECT");
    const [selectedAi, setSelectedAi] = useState<AiModel | null>(null);
    const handleSelect = useCallback((ai: AiModel) => {
        setSelectedAi(ai);
        setFlowState("FUSION");
    }, []);
    const handleFusionComplete = useCallback(() => {
        setFlowState("GENERATE");
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden bg-background select-none">
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none">
                <div className="absolute top-4 left-6 font-mono text-[7px] tracking-[0.5em] uppercase">Phase::Synthesis</div>
                <div className="absolute top-4 right-6 font-mono text-[7px] tracking-[0.5em] uppercase opacity-50">v4.0.2</div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--color-primary)_0%,transparent_40%)] opacity-[0.3]" />
            </div>

            <div className="relative h-full w-full flex flex-col items-center justify-start pt-4 md:pt-6 px-4 overflow-hidden transition-all duration-700 group-hover:scale-[1.03]">
                <AnimatePresence mode="wait">
                    {flowState === "SELECT" && (
                        <AiSelectFlow
                            key="select"
                            onSelect={handleSelect}
                        />
                    )}
                    {flowState === "FUSION" && selectedAi && (
                        <AiFusionFlow
                            key="fusion"
                            selectedAi={selectedAi}
                            onComplete={handleFusionComplete}
                        />
                    )}
                    {flowState === "GENERATE" && selectedAi && (
                        <GenerationFlow key="generate" selectedAi={selectedAi} />
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/75 to-transparent pointer-events-none z-20" />
        </div>
    );
});

AIGenerationVisual.displayName = "AIGenerationVisual";
