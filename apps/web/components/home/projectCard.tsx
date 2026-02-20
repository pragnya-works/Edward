import { memo, useMemo } from "react";
import { m } from "motion/react";
import { FolderOpen, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { TechnicalBlueprint } from "./cardVisual";
import type { Project } from "@/hooks/useRecentChats";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@edward/ui/components/alert-dialog";

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
    <AlertDialog>
      <m.div
        initial={{ opacity: 0, filter: "blur(8px)", y: 8 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.25, 0.1, 0.25, 1],
          delay: Math.min(index * 0.03, 0.15),
        }}
        className="group relative flex flex-col rounded-xl border border-border/60 dark:border-white/[0.08] bg-foreground/[0.02] dark:bg-white/[0.04] p-3 sm:p-4 lg:p-5 transition-all duration-300 hover:border-foreground/[0.12] dark:hover:border-white/[0.16] hover:bg-foreground/[0.05] dark:hover:bg-white/[0.07] hover:shadow-md dark:hover:shadow-2xl dark:hover:shadow-black/50 cursor-pointer aspect-video overflow-hidden"
      >
        <Link
          href={`/chat/${project.id}`}
          className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={project.title || "Open project"}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="absolute -bottom-18 -right-20 w-[65%] aspect-[7/5] sm:-bottom-20 sm:-right-24 sm:w-[70%] lg:-bottom-24 lg:-right-36 lg:w-[80%] xl:-bottom-32 xl:-right-44 xl:w-[90%] text-foreground/[0.08] group-hover:text-foreground/[0.14] transition-all duration-700 group-hover:-translate-x-2 group-hover:-translate-y-1 pointer-events-none">
          <TechnicalBlueprint />
        </div>
        {onDelete && (
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 scale-100 sm:scale-90 sm:group-hover:scale-100 transition-all duration-200 bg-background/80 dark:bg-white/[0.06] border border-border/60 dark:border-white/[0.12] text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/40 shadow-sm dark:shadow-none"
              aria-label="Delete project"
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </AlertDialogTrigger>
        )}

        <div className="relative z-[2] flex flex-col h-full pointer-events-none">
          <div className="mb-2 sm:mb-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg bg-foreground/[0.05] dark:bg-white/[0.08] dark:ring-1 dark:ring-white/[0.07] text-foreground group-hover:scale-110 transition-transform duration-300">
              <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <h3 className="font-semibold text-sm sm:text-base text-foreground mb-0.5 sm:mb-1 line-clamp-1 transition-colors duration-300">
            {project.title || "Untitled Project"}
          </h3>

          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 flex-1">
            {project.description || "No description"}
          </p>

          <div className="mt-2 sm:mt-3 text-[9px] sm:text-[10px] uppercase tracking-wider font-medium text-muted-foreground/40">
            Updated {formattedDate}
          </div>
        </div>
      </m.div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            <span className="font-medium text-foreground/80">
              &ldquo;{project.title || "Untitled Project"}&rdquo;
            </span>{" "}
            and all its messages will be permanently deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete?.(project.id)}
          >
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});