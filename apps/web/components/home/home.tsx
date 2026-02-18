"use client";

import { ShaderGradientBackground } from "@/components/home/shaderGradient";
import { Hero } from "@/components/home/hero";
import { Features } from "@/components/home/features";
import { CTASection } from "@/components/home/ctaSection";
import { Footer } from "@/components/home/footer";
import { TopFade } from "@/components/home/topFade";
import { useSession } from "@/lib/auth-client";
import { AnimatePresence, m } from "motion/react";
import { RecentProjects } from "@/components/home/recentProjects";
import { cn } from "@edward/ui/lib/utils";
import { Skeleton } from "@edward/ui/components/skeleton";
import { BlueprintBackground } from "@/components/home/blueprintBackground";

function LoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopFade />
      <main className="flex-1">
        <Hero />
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {["skeleton-a", "skeleton-b", "skeleton-c"].map((skeletonId) => (
              <Skeleton
                key={skeletonId}
                className="aspect-video w-full rounded-xl"
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const { data: session, isPending } = useSession();

  const isLoading = isPending;

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        !session?.user ? "min-h-screen dark" : "h-full",
      )}
    >
      <TopFade />
      {!session?.user ? <ShaderGradientBackground /> : <BlueprintBackground />}
      <main className="flex-1">
        <Hero />
        <AnimatePresence mode="wait">
          {session?.user ? (
            <m.div
              key="recent-projects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <RecentProjects />
            </m.div>
          ) : (
            <m.div
              key="landing-features"
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
            </m.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
