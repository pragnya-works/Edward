"use client"

import { ShaderGradientBackground } from "@/components/home/shaderGradient"
import { Hero } from "@/components/home/hero"
import { Features } from "@/components/home/features"
import { CTASection } from "@/components/home/ctaSection"
import { Footer } from "@/components/home/footer"
import { TopFade } from "@/components/home/topFade"
import { useSession } from "@/lib/auth-client"

import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

export default function Home() {
  const { data: session, isPending } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isPending && !session?.user && resolvedTheme !== "dark") {
      setTheme("dark");
    }
  }, [isPending, session, setTheme, resolvedTheme]);

  if (isPending) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <TopFade />
      {!session?.user && <ShaderGradientBackground />}
      <main className="flex-1">
        <Hero />
        <AnimatePresence mode="wait">
          {!session?.user && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative -mt-48"
            >
              <div
                className="absolute inset-0 bg-background pointer-events-none"
                style={{
                  maskImage:
                    "linear-gradient(to bottom, transparent, black 400px, black)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent, black 400px, black)",
                }}
              />
              <div className="relative z-10">
                <Features />
                <CTASection />
                <Footer />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}