"use client";

import React, { memo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { BentoCard, BentoGrid } from "@edward/ui/components/bento-grid";
import { DottedMap } from "@edward/ui/components/dotted-map";
import { LineShadowText } from "@edward/ui/components/line-shadow-text";
import { motion, useReducedMotion } from "motion/react";
import { useTabVisibility } from "@/hooks/useTabVisibility";

const AIGenerationVisual = dynamic(
    () => import("./aiGenerationVisual").then((mod) => mod.AIGenerationVisual),
    { ssr: false },
);

const InstantPreviewVisual = dynamic(
    () => import("./instantPreviewVisual").then((mod) => mod.InstantPreviewVisual),
    { ssr: false },
);

const AgentActivityVisual = dynamic(
    () => import("./agentActivityVisual").then((mod) => mod.AgentActivityVisual),
    { ssr: false },
);

const PreviewBackground = memo(() => {
    return (
        <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_60%,transparent_90%)]">
            <InstantPreviewVisual />
        </div>
    );
});
PreviewBackground.displayName = "PreviewBackground";

const GLOBE_MARKERS: Array<{ lat: number; lng: number; size: number }> = [
    { lat: 40.7128, lng: -74.0060, size: 1.2 },
    { lat: 51.5074, lng: -0.1278, size: 1.2 },
    { lat: 35.6762, lng: 139.6503, size: 1.2 },
    { lat: -33.8688, lng: 151.2093, size: 1.2 },
    { lat: 1.3521, lng: 103.8198, size: 1.2 }
];

const PulsingOrb = memo(function PulsingOrb() {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const shouldReduceMotion = useReducedMotion();
    const elementRef = useRef<HTMLDivElement>(null);
    const isDocumentVisible = useTabVisibility();
    
    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        
        const observer = new IntersectionObserver(
            ([entry]) => setIsIntersecting(entry?.isIntersecting ?? false),
            { threshold: 0.1 }
        );
        
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    
    const shouldAnimate = isDocumentVisible && isIntersecting && !shouldReduceMotion;
    
    return (
        <motion.div
            ref={elementRef}
            animate={shouldAnimate ? { scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] } : { scale: 1, opacity: 0.075 }}
            transition={shouldAnimate ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
            className="absolute top-[35%] left-1/2 -translate-x-1/2 w-40 h-40 bg-primary/30 rounded-full blur-3xl"
        />
    );
});

const GlobeBackground = memo(() => {
    return (
        <div className="absolute inset-0 flex items-start justify-center pt-4 md:pt-8 overflow-hidden pointer-events-none transition-all duration-700 group-hover:scale-[1.03] group-hover:rotate-1">
            <div className="absolute top-[20%] md:top-[25%] left-1/2 -translate-x-1/2 w-48 md:w-64 h-48 md:h-64 bg-primary/10 blur-[60px] md:blur-[80px] rounded-full group-hover:bg-primary/15 transition-colors duration-700" />

            <div className="relative w-full h-[85%] md:h-[90%] [mask-image:radial-gradient(circle_at_50%_35%,black_50%,transparent_90%)]">
                <DottedMap
                    className="opacity-20 group-hover:opacity-40 transition-all duration-700 scale-[1.5] md:scale-125 group-hover:scale-[1.6] md:group-hover:scale-[1.3] text-primary/30"
                    dotColor="currentColor"
                    dotRadius={0.4}
                    markers={GLOBE_MARKERS}
                    markerColor="var(--color-primary)"
                />
            </div>

            <PulsingOrb />

            <div className="absolute inset-x-0 bottom-0 h-32 md:h-40 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
    );
});
GlobeBackground.displayName = "GlobeBackground";

const TerminalBackground = memo(() => {
    return (
        <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_60%,transparent_95%)]">
            <AgentActivityVisual />
        </div>
    );
});
TerminalBackground.displayName = "TerminalBackground";

const features = [
    {
        name: "AI-Powered Generation",
        description: "Describe your vision and watch Edward turn your ideas into functional, beautiful React components.",
        href: "/",
        cta: "Explore Generations",
        className: "md:col-span-2",
        background: <AIGenerationVisual />,
    },
    {
        name: "Instant Preview",
        description: "See real-time updates as you refine your prompt - what you see is what you get.",
        href: "/",
        cta: "Try Editor",
        className: "md:col-span-1",
        background: <PreviewBackground />,
    },
    {
        name: "Frontend Builder",
        description: "Build production-ready React components, pages, and UI with instant feedback and live preview.",
        href: "/",
        cta: "Start Building",
        className: "md:col-span-1",
        background: <GlobeBackground />,
    },
    {
        name: "Autonomous Intelligence",
        description: "Edward plans, executes, and iterates. It doesn't just write code; it follows instructions to completion across your entire project.",
        href: "/",
        cta: "Try now",
        className: "md:col-span-2",
        background: <TerminalBackground />,
    },
];


const FasterText = memo(({ shadowColor }: { shadowColor: string }) => {
    return (
        <motion.span
            initial="initial"
            whileHover="active"
            className="group relative inline-block cursor-default"
        >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 pointer-events-none overflow-hidden">
                {[...Array(3)].map((_, i) => (
                    <motion.div
                        key={i}
                        variants={{
                            initial: { x: "-120%", opacity: 0 },
                            active: {
                                x: ["120%", "-120%"],
                                opacity: [0, 0.4, 0],
                                transition: {
                                    duration: 0.3,
                                    repeat: Infinity,
                                    delay: i * 0.1,
                                    ease: "linear"
                                }
                            }
                        }}
                        style={{ top: `${20 + i * 30}%` }}
                        className="absolute w-full h-[0.5px] bg-primary/30"
                    />
                ))}
            </div>

            <motion.span
                className="relative inline-block"
                variants={{
                    initial: { y: 0, x: 0, scale: 1, rotate: 0 },
                    active: {
                        y: [0, -3, -2.5, -3.2, -3],
                        x: [0, 1.2, -1.2, 1, -1, 0],
                        scale: 1.05,
                        rotate: [0, 1.5, -1.5, 1.5, 0],
                        transition: {
                            y: { duration: 0.1, ease: "easeOut" },
                            x: { duration: 0.06, repeat: Infinity, ease: "linear" },
                            rotate: { duration: 0.08, repeat: Infinity, ease: "linear" },
                            scale: { duration: 0.2, ease: "circOut" }
                        }
                    }
                }}
            >
                <LineShadowText
                    className="italic transition-all duration-300 group-hover:text-primary group-hover:brightness-125"
                    shadowColor={shadowColor}
                >
                    faster
                </LineShadowText>
                <motion.div
                    variants={{
                        initial: { opacity: 0, scale: 0.8 },
                        active: {
                            opacity: [0, 0.3, 0.15],
                            scale: [0.8, 1.2, 1],
                            transition: {
                                opacity: { duration: 0.2 },
                                scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                            }
                        }
                    }}
                    className="absolute -inset-2 bg-primary/10 blur-xl rounded-full -z-10"
                />
            </motion.span>

            <motion.div
                variants={{
                    initial: { width: "0%", opacity: 0 },
                    active: {
                        width: ["0%", "100%", "90%"],
                        opacity: [0, 0.8, 0.6],
                        transition: { duration: 0.3, ease: "circOut" }
                    }
                }}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent"
            />
        </motion.span>
    );
});
FasterText.displayName = "FasterText";


export function Features() {
    return (
        <section className="relative w-full py-14 md:py-32 px-4 overflow-hidden">

            <div className="mx-auto max-w-6xl relative z-10">
                <div className="my-10 md:my-20 flex flex-col items-center justify-center text-center">
                    <h2 className="mb-4 md:mb-6 text-2xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
                        Everything you need to ship{" "}
                        <FasterText shadowColor="var(--foreground)" />
                    </h2>
                    <p className="max-w-2xl text-sm md:text-base lg:text-lg text-muted-foreground leading-relaxed">
                        Edward streamlines the entire development journey, seamlessly transforming your vision into functional, interactive applications.
                    </p>
                </div>

                <BentoGrid>
                    {features.map((feature) => (
                        <BentoCard key={feature.name} {...feature} />
                    ))}
                </BentoGrid>
            </div>
        </section>
    );
}
