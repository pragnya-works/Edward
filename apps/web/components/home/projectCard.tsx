import { memo, useMemo } from "react";
import { m } from "motion/react";
import { FolderOpen, ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { TechnicalBlueprint } from "./cardVisual";
import type { Project } from "@/hooks/useRecentChats";
import { Button } from "@edward/ui/components/button";

export const ProjectCard = memo(function ProjectCard({
  project,
  index,
  isVisible,
  onDelete,
}: {
  project: Project;
  index: number;
  isVisible: boolean;
  onDelete?: (chatId: string) => void;
}) {
  const formattedDate = useMemo(() => {
    const date = new Date(project.updatedAt);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [project.updatedAt]);

  if (!isVisible) {
    return (
      <div
        key={`placeholder-${project.id}`}
        className="block aspect-video rounded-xl border border-transparent"
      />
    );
  }

  return (
    <Link
      key={`card-${project.id}`}
      href={`/chat/${project.id}`}
      className="block w-full"
    >
      <m.div
        initial={{ opacity: 0, filter: "blur(8px)", y: 8 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.25, 0.1, 0.25, 1],
          delay: Math.min(index * 0.03, 0.15),
        }}
        className="group relative flex flex-col rounded-xl border border-border bg-foreground/[0.02] p-3 sm:p-4 lg:p-5 transition-all duration-300 hover:border-foreground/[0.1] hover:bg-foreground/[0.05] hover:shadow-md dark:hover:shadow-2xl dark:hover:shadow-black/50 cursor-pointer aspect-video overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="absolute -bottom-18 -right-20 w-[65%] aspect-[7/5] sm:-bottom-20 sm:-right-24 sm:w-[70%] lg:-bottom-24 lg:-right-36 lg:w-[80%] xl:-bottom-32 xl:-right-44 xl:w-[90%] text-foreground/[0.12] group-hover:text-foreground/[0.22] transition-all duration-700 group-hover:-translate-x-2 group-hover:-translate-y-1 pointer-events-none">
          <TechnicalBlueprint />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground group-hover:scale-110 transition-transform duration-300">
              <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="flex items-center gap-1.5">
              {onDelete && (
                <Button
                  type="button"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(project.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  aria-label="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
            </div>
          </div>

          <h3 className="font-semibold text-sm sm:text-base text-foreground mb-0.5 sm:mb-1 line-clamp-1 transition-colors duration-300">
            {project.title || "Untitled Project"}
          </h3>

          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-2 sm:mb-3 flex-1">
            {project.description || "No description"}
          </p>

          <div className="text-[9px] sm:text-[10px] uppercase tracking-wider font-medium text-muted-foreground/40">
            Updated {formattedDate}
          </div>
        </div>
      </m.div>
    </Link>
  );
});