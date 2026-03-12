"use client";

import React, { memo, useState, useCallback, useMemo, useEffect } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { cn } from "@edward/ui/lib/utils";
import { useVisibilityAwareInterval } from "@edward/ui/hooks/useVisibilityAwareInterval";
import { OpenAI } from "@edward/ui/components/ui/openAi";
import { Gemini } from "@edward/ui/components/ui/gemini";
import { ClaudeAI } from "@edward/ui/components/ui/claudeAi";
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

type FlowState = "SELECT" | "FUSION" | "GENERATE";
type AiModel = "openai" | "gemini" | "anthropic";

const MODEL_CONFIG: Record<
    AiModel,
    {
        label: string;
        baseClasses: string;
        activeClasses: string;
        inactiveClasses: string;
        labelClasses: string;
        blurColor: string;
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        iconClassName: string;
    }
> = {
    openai: {
        label: "OpenAI",
        baseClasses: "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_8px_30px_rgba(0,0,0,0.12)]",
        activeClasses: "border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_0_40px_rgba(255,255,255,0.08)]",
        inactiveClasses: "opacity-40 grayscale",
        labelClasses: "text-foreground",
        blurColor: "rgba(255,255,255,0.15)",
        icon: OpenAI,
        iconClassName: "text-foreground drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]",
    },
    gemini: {
        label: "Gemini",
        baseClasses: "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_8px_30px_rgba(0,0,0,0.12)]",
        activeClasses: "border-[#3186FF]/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_0_40px_rgba(49,134,255,0.15)]",
        inactiveClasses: "opacity-40 grayscale",
        labelClasses: "text-[#3186FF]",
        blurColor: "rgba(49,134,255,0.3)",
        icon: Gemini,
        iconClassName: "drop-shadow-[0_0_15px_rgba(49,134,255,0.4)]",
    },
    anthropic: {
        label: "Claude",
        baseClasses: "bg-[#D97757]/[0.04] border-white/[0.08] hover:bg-[#D97757]/[0.08] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_30px_rgba(217,119,87,0.18)]",
        activeClasses: "border-[#D97757]/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_0_40px_rgba(217,119,87,0.2)]",
        inactiveClasses: "opacity-40 grayscale",
        labelClasses: "text-[#D97757]",
        blurColor: "rgba(217,119,87,0.3)",
        icon: ClaudeAI,
        iconClassName: "drop-shadow-[0_0_12px_rgba(217,119,87,0.28)]",
    },
};

const MODEL_ORDER = Object.keys(MODEL_CONFIG) as Array<keyof typeof MODEL_CONFIG>;
const STATIC_TEXT_VARIANTS = {
    hidden: { opacity: 1, y: 0 },
    show: { opacity: 1, y: 0 },
    exit: { opacity: 1, y: 0 },
} as const;

const AiSelectFlow = memo(({ onSelect, selectedAi, shouldReduceMotion }: { onSelect: (ai: AiModel) => void; selectedAi: AiModel | null; shouldReduceMotion: boolean }) => {
    const [hovered, setHovered] = useState<AiModel | null>(null);
    const isMotionSafe = !shouldReduceMotion;

    return (
        <m.div
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="absolute inset-0 z-10 flex flex-col items-center justify-start gap-4 px-4 pt-10 pointer-events-auto sm:gap-5 sm:pt-12 md:pt-14"
        >
            <m.h3
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: -10 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.5 }}
                className="px-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/50 sm:text-sm"
            >
                Choose Intelligence
            </m.h3>

            <div className="grid w-full max-w-[17rem] grid-cols-3 gap-2 sm:max-w-[20rem] sm:gap-3 md:max-w-[23rem]">
                {MODEL_ORDER.map((model, index) => {
                    const config = MODEL_CONFIG[model];
                    const Icon = config.icon;
                    const isHovered = hovered === model;
                    const isDimmed = hovered !== null && hovered !== model;

                    return (
                        <m.button
                            key={model}
                            aria-label={`Select ${config.label}`}
                            aria-pressed={selectedAi === model}
                            onClick={() => onSelect(model)}
                            onMouseEnter={() => setHovered(model)}
                            onMouseLeave={() => setHovered(null)}
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
                            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 + (index * 0.12), duration: 0.45 }}
                            className={cn(
                                "relative flex aspect-square w-full flex-col items-center justify-center rounded-[1.15rem] border px-2 py-2.5 sm:px-3 sm:py-3",
                                "shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]",
                                isMotionSafe ? "transition-all duration-500" : "",
                                config.baseClasses,
                                isHovered ? config.activeClasses : "",
                                isDimmed ? config.inactiveClasses : "",
                                isMotionSafe && isHovered ? "scale-[1.03]" : "",
                                isMotionSafe && isDimmed ? "scale-95" : ""
                            )}
                        >
                            <div className="relative flex h-8 w-8 items-center justify-center sm:h-10 sm:w-10 md:h-11 md:w-11">
                                <m.div
                                    initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
                                    animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.4 + (index * 0.12), duration: 0.45 }}
                                    className={cn(
                                        "absolute inset-0",
                                        isMotionSafe ? "transition-all duration-300" : ""
                                    )}
                                >
                                    <Icon className={cn("h-full w-full", config.iconClassName)} />
                                </m.div>
                            </div>
                            <span
                                className={cn(
                                    "mt-2 text-center text-[7px] font-bold uppercase tracking-[0.16em] sm:text-[8px] md:text-[9px]",
                                    isMotionSafe ? "transition-all duration-300" : "",
                                    config.labelClasses,
                                    hovered === null ? "opacity-85" : isHovered ? "opacity-100" : "opacity-45"
                                )}
                            >
                                {config.label}
                            </span>
                        </m.button>
                    );
                })}
            </div>
        </m.div>
    );
});
AiSelectFlow.displayName = "AiSelectFlow";

const AiFusionFlow = memo(({ selectedAi, onComplete, shouldReduceMotion }: { selectedAi: AiModel, onComplete: () => void; shouldReduceMotion: boolean }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onComplete();
        }, shouldReduceMotion ? 0 : 2500);
        return () => clearTimeout(timer);
    }, [onComplete, shouldReduceMotion]);

    const config = MODEL_CONFIG[selectedAi];
    const Icon = config.icon;

    return (
        <m.div
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="absolute inset-0 z-40 flex items-start justify-center overflow-hidden pointer-events-none pt-14 sm:pt-16 md:items-center md:pt-0"
        >
            <m.div
                initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                animate={shouldReduceMotion ? { opacity: 0.9 } : { opacity: [0, 1, 0] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 3, times: [0, 0.4, 1] }}
                className="absolute inset-0 bg-background/90 z-0"
            />

            <m.div
                initial={shouldReduceMotion ? undefined : { scale: 0.5, opacity: 0 }}
                animate={shouldReduceMotion ? { scale: 1, opacity: 0.85 } : { scale: [0.5, 3, 8], opacity: [0, 1, 0] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.5, ease: "easeIn" }}
                className="absolute w-24 h-24 md:w-32 md:h-32 rounded-full z-10 blur-3xl mix-blend-screen"
                style={{ backgroundColor: config.blurColor }}
            />

            <m.div
                initial={shouldReduceMotion ? undefined : { scale: 0.5, opacity: 0 }}
                animate={shouldReduceMotion ? { scale: 1, opacity: 1, filter: "blur(0px)", rotate: 0 } : {
                    scale: [0.5, 1.2, 0.1],
                    opacity: [0, 1, 0],
                    filter: ["blur(4px)", "blur(0px)", "blur(10px)"],
                    rotate: [0, 0, 180]
                }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.5, ease: "easeInOut" }}
                className="absolute z-20 w-16 h-16 md:w-20 md:h-20"
            >
                <Icon className={cn("h-full w-full", config.iconClassName)} />
            </m.div>
            <m.div
                initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                animate={shouldReduceMotion ? { opacity: 0 } : { opacity: [0, 0, 1, 0] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, times: [0, 0.3, 0.5, 1], delay: 1 }}
                className="absolute inset-0 bg-white z-50 mix-blend-overlay"
            />
            <m.div
                initial={shouldReduceMotion ? undefined : { scale: 0.5, opacity: 0, filter: "blur(8px)" }}
                animate={shouldReduceMotion ? { scale: 1, opacity: 1, filter: "blur(0px)" } : { scale: [0.5, 1.08, 1], opacity: [0, 1, 1], filter: ["blur(8px)", "blur(0px)", "blur(0px)"] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.2, delay: 1.2, ease: "easeOut" }}
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


const GenerationFlow = memo(function GenerationFlow({ selectedAi, shouldReduceMotion }: { selectedAi: AiModel; shouldReduceMotion: boolean }) {
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
                initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 10 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, filter: "blur(8px)", scale: 1.02, y: -10 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                className="flex flex-col items-center w-full max-w-xl gap-3 md:gap-4"
            >
                <div className="w-full flex flex-col items-center text-center gap-1 md:gap-2">
                    <m.div
                        initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
                        animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
                        transition={shouldReduceMotion ? { duration: 0 } : undefined}
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
                        animation={shouldReduceMotion ? undefined : "fadeIn"}
                        by="word"
                        duration={shouldReduceMotion ? 0 : 0.6}
                        variants={shouldReduceMotion ? STATIC_TEXT_VARIANTS : undefined}
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
                                initial={shouldReduceMotion ? undefined : { opacity: 0, x: 5 }}
                                animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.8 + (lineIndex * 0.08), duration: 0.4 }}
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
                        {MODEL_CONFIG[selectedAi].label}::ACTIVE
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
    const shouldReduceMotion = useReducedMotion() ?? false;
    const isMotionSafe = !shouldReduceMotion;
    const handleSelect = useCallback((ai: AiModel) => {
        setSelectedAi(ai);
        setFlowState(shouldReduceMotion ? "GENERATE" : "FUSION");
    }, [shouldReduceMotion]);
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

            <div
                className={cn(
                    "relative flex h-full w-full flex-col items-center justify-start overflow-hidden px-3 pt-4 md:px-4 md:pt-6",
                    isMotionSafe ? "transition-all duration-700 group-hover:scale-[1.03]" : ""
                )}
            >
                <AnimatePresence mode="wait">
                    {flowState === "SELECT" && (
                        <AiSelectFlow
                            key="select"
                            onSelect={handleSelect}
                            selectedAi={selectedAi}
                            shouldReduceMotion={shouldReduceMotion}
                        />
                    )}
                    {flowState === "FUSION" && selectedAi && (
                        <AiFusionFlow
                            key="fusion"
                            selectedAi={selectedAi}
                            onComplete={handleFusionComplete}
                            shouldReduceMotion={shouldReduceMotion}
                        />
                    )}
                    {flowState === "GENERATE" && selectedAi && (
                        <GenerationFlow key="generate" selectedAi={selectedAi} shouldReduceMotion={shouldReduceMotion} />
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/70 to-transparent pointer-events-none z-20" />
        </div>
    );
});

AIGenerationVisual.displayName = "AIGenerationVisual";
