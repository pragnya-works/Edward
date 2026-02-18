"use client";

import { useState, useEffect, useRef } from "react";
import { m } from "motion/react";
import { useRecentChats, type Project } from "@/hooks/useRecentChats";
import { TechnicalBlueprint } from "./cardVisual";
import { ProjectCard } from "./projectCard";

export function RecentProjects() {
  const { projects, hasMore, isLoading, isLoadingMore, loadMore } =
    useRecentChats();

  const [visibleProjects, setVisibleProjects] = useState<Set<string>>(
    new Set(),
  );
  const loadTriggerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (projects.length > 0) {
      setVisibleProjects(new Set(projects.map((p) => p.id)));
    }
  }, [isLoading, projects]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          loadMoreRef.current();
        }
      },
      { threshold: 0.1 },
    );

    const currentRef = loadTriggerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoadingMore]);

  if (isLoading) {
    return null;
  }

  if (projects.length === 0) {
    return (
      <section className="w-full py-12">
        <div className="w-full px-4 md:px-6 lg:px-10">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              Recent Projects
            </h2>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%)",
            }}
          >
            {["placeholder-a", "placeholder-b", "placeholder-c"].map(
              (placeholderId, index) => (
              <m.div
                key={placeholderId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.25, 0.1, 0.25, 1],
                  delay: index * 0.08,
                }}
                className="relative flex flex-col rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] aspect-video overflow-hidden"
              >
                <div className="pointer-events-none absolute -bottom-18 -right-20 w-[65%] aspect-[7/5] sm:-bottom-20 sm:-right-24 sm:w-[70%] lg:-bottom-24 lg:-right-36 lg:w-[80%] xl:-bottom-32 xl:-right-44 xl:w-[90%] text-foreground/[0.05]">
                  <TechnicalBlueprint />
                </div>

                {index === 1 && (
                  <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
                    <h3 className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-base font-semibold tracking-tight text-transparent sm:text-lg">
                      Your workspace awaits
                    </h3>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground/50 max-w-[220px]">
                      Start a conversation above to ship your first project
                    </p>
                  </div>
                )}
              </m.div>
              ),
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-12">
      <div className="w-full px-4 md:px-6 lg:px-10">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            Recent Projects
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: Project, index: number) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              isVisible={visibleProjects.has(project.id)}
            />
          ))}
        </div>

        <div ref={loadTriggerRef} className="h-4" />
      </div>
    </section>
  );
}
