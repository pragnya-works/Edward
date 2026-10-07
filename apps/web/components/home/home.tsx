"use client";

import { ShaderGradientBackground } from "@/components/home/shaderGradient";
import { Hero } from "@/components/home/hero";
import { Features } from "@/components/home/features";
import { CTASection } from "@/components/home/ctaSection";
import { Footer } from "@/components/home/footer";
import { TopFade } from "@/components/home/topFade";
import { useSession } from "@/lib/auth-client";
import { m } from "motion/react";
import { RecentProjects } from "@/components/home/recentProjects";
import { BlueprintBackground } from "@/components/home/blueprintBackground";
import { useEffect, useSyncExternalStore } from "react";
import {
  LOCATION_CHANGE_EVENT,
  quickScrollToRecentProjects,
} from "@edward/ui/lib/recentProjectsScroll";

function subscribeToLocationSearch(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(LOCATION_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
  };
}

function readLocationSearch() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.search;
}



function SectionScrollHandler({
  userId,
}: {
  userId: string | undefined;
}) {
  const locationSearch = useSyncExternalStore(
    subscribeToLocationSearch,
    readLocationSearch,
    () => "",
  );
  const sectionTarget = new URLSearchParams(locationSearch).get("section");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashTarget = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const requestedTarget = sectionTarget || hashTarget;
    if (requestedTarget !== "recent-projects") {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    const maxAttempts = 20;

    const tryScroll = () => {
      attempts += 1;
      const didScroll = quickScrollToRecentProjects();
      if (didScroll || attempts >= maxAttempts) {
        if (intervalId !== undefined) {
          clearInterval(intervalId);
        }
      }
    };

    tryScroll();
    if (attempts < maxAttempts) {
      intervalId = setInterval(tryScroll, 80);
    }

    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [sectionTarget, userId]);

  return null;
}

function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen dark">
      <TopFade />
      <ShaderGradientBackground />
      <main className="flex-1">
        <Hero />
        <div className="relative -mt-48">
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
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();

  if (!session?.user) {
    return <LandingPage />;
  }

  return (
    <div className="flex flex-col h-full">
      <SectionScrollHandler userId={session.user.id} />
      <TopFade />
      <BlueprintBackground />
      <main className="flex-1">
        <Hero />
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <RecentProjects />
        </m.div>
      </main>
    </div>
  );
}
