"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { AnimatePresence, m } from "motion/react";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import {
  BrowserHeader,
  Sidebar,
  SkeletonUI,
  LayoutType,
  LayoutRenderer,
  LAYOUT_ORDER,
} from "./instantPreviewLayouts";

const fadeInVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export function InstantPreviewVisual() {
  const [index, setIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(true);
  const generatingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCycle = useCallback(() => {
    setIsGenerating(true);

    if (generatingTimeoutRef.current) {
      clearTimeout(generatingTimeoutRef.current);
    }

    generatingTimeoutRef.current = setTimeout(() => {
      setIndex((prev) => (prev + 1) % LAYOUT_ORDER.length);
      setIsGenerating(false);
    }, 1200);
  }, []);

  useVisibilityAwareInterval(handleCycle, 6000);

  useEffect(() => {
    const initialTimer = setTimeout(() => setIsGenerating(false), 1200);

    return () => {
      clearTimeout(initialTimer);
      if (generatingTimeoutRef.current) {
        clearTimeout(generatingTimeoutRef.current);
      }
    };
  }, []);

  const currentLayoutType = LAYOUT_ORDER[index] ?? LayoutType.DASHBOARD;

  return (
    <div className="absolute inset-0 flex justify-center opacity-95 pointer-events-none group-hover:scale-[1.03] transition-transform duration-[1.5s] ease-out pt-4">
      <div className="h-[80%] md:h-[70%] w-[92%] md:w-[85%] rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.4)] relative top-2 md:top-4 transition-all duration-700 overflow-hidden flex flex-col antialiased">
        <BrowserHeader />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar />

          <AnimatePresence mode="wait">
            {isGenerating ? (
              <m.div
                key="skeleton"
                variants={fadeInVariant}
                initial="initial"
                animate="animate"
                exit={{
                  opacity: 0,
                  filter: "blur(8px)",
                  scale: 1.05,
                  transition: { duration: 0.3 },
                }}
                className="flex-1 h-full relative"
              >
                <SkeletonUI />
                <m.div
                  animate={{ top: ["0%", "100%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_rgba(var(--color-primary),0.3)] z-20"
                />
              </m.div>
            ) : (
              <m.div
                key={`layout-${currentLayoutType}`}
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                className="flex-1 h-full bg-background/20"
              >
                <LayoutRenderer type={currentLayoutType} />
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute inset-0 pointer-events-none border border-white/[0.03] rounded-2xl" />
      </div>
    </div>
  );
}
