"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
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
  const prevProjectsLengthRef = useRef(0);
  const loadMoreRef = useRef(loadMore);
  const initialLoadRef = useRef(true);
  loadMoreRef.current = loadMore;
  const projectsLength = projects.length;

  useEffect(() => {
    if (isLoading) {
      setVisibleProjects(new Set());
      prevProjectsLengthRef.current = 0;
      initialLoadRef.current = true;
      return;
    }

    if (projectsLength > 0) {
      if (initialLoadRef.current) {
        setVisibleProjects(new Set());
        const rafId = requestAnimationFrame(() => {
          setVisibleProjects(new Set(projects.map((p) => p.id)));
        });
        prevProjectsLengthRef.current = projectsLength;
        initialLoadRef.current = false;
        return () => cancelAnimationFrame(rafId);
      }

      if (projectsLength > prevProjectsLengthRef.current) {
        const newProjects = projects.slice(prevProjectsLengthRef.current);
        setVisibleProjects((prev) => {
          const newSet = new Set(prev);
          newProjects.forEach((p) => newSet.add(p.id));
          return newSet;
        });
      }
      prevProjectsLengthRef.current = projectsLength;
    }
  }, [isLoading, projectsLength, projects]);

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
            <h2 className="text-2xl font-semibold tracking-tight text-foreground/30">
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
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.25, 0.1, 0.25, 1],
                  delay: i * 0.08,
                }}
                className="relative flex flex-col rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01] aspect-video overflow-hidden"
              >
                <div className="pointer-events-none absolute -bottom-18 -right-20 w-[65%] aspect-[7/5] sm:-bottom-20 sm:-right-24 sm:w-[70%] lg:-bottom-24 lg:-right-36 lg:w-[80%] xl:-bottom-32 xl:-right-44 xl:w-[90%] text-white/[0.04]">
                  <TechnicalBlueprint />
                </div>

                {i === 1 && (
                  <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
                    <h3 className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-base font-semibold tracking-tight text-transparent sm:text-lg">
                      Your workspace awaits
                    </h3>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground/50 max-w-[220px]">
                      Start a conversation above to ship your first project
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
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