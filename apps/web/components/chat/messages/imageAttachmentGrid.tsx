"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Image from "next/image";
import { Expand, X } from "lucide-react";
import { MessageAttachmentType, type ChatMessage } from "@edward/shared/chat/types";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@edward/ui/components/dialog";
import { Sheet, SheetContent, SheetTitle } from "@edward/ui/components/sheet";
import { useIsMobile } from "@edward/ui/hooks/useMobile";

interface ImageAttachmentGridProps {
  attachments: NonNullable<ChatMessage["attachments"]>;
}

const accentOutlineClass =
  "pointer-events-none absolute -inset-[2px] sm:-inset-[3px] rounded-[8px] sm:rounded-[10px] border border-sky-500/40 dark:border-sky-400/30";

export const ImageAttachmentGrid = memo(function ImageAttachmentGrid({
  attachments,
}: ImageAttachmentGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const imageAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment) => attachment.type === MessageAttachmentType.IMAGE,
      ),
    [attachments],
  );

  const totalImages = imageAttachments.length;
  const hasMultipleImages = totalImages > 1;

  const openViewer = useCallback((index: number) => {
    setActiveIndex(index);
    setIsViewerOpen(true);
  }, []);

  useEffect(() => {
    if (activeIndex < totalImages) {
      return;
    }
    setActiveIndex(Math.max(0, totalImages - 1));
  }, [activeIndex, totalImages]);

  if (totalImages === 0) {
    return null;
  }

  const safeIndex =
    activeIndex >= 0 && activeIndex < totalImages ? activeIndex : 0;
  const activeAttachment = imageAttachments[safeIndex] ?? imageAttachments[0]!;
  const activeLabel = activeAttachment.name || `Image ${safeIndex + 1}`;
  const viewerFrameHeight = isMobile
    ? "h-[min(43dvh,410px)]"
    : "h-[min(52vh,540px)]";

  const viewerBody = (
    <div className="relative flex h-full flex-col bg-background/90 dark:bg-[oklch(0.185_0_0)]">
      <div className="shrink-0 border-b border-border/20 bg-background/50 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-5 sm:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-border/45 bg-muted/45 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-foreground/72 dark:border-white/[0.14] dark:bg-white/[0.05]">
            {safeIndex + 1} of {totalImages}
            </span>
            <span className="truncate text-[11px] font-medium text-foreground/78 sm:text-xs">
              {activeLabel}
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsViewerOpen(false)}
            className="h-9 w-9 rounded-lg border border-border/45 bg-background/70 text-foreground/70 transition-colors hover:bg-muted/75 hover:text-foreground dark:border-white/[0.14] dark:bg-white/[0.045] dark:hover:bg-white/[0.085]"
            aria-label="Close image viewer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-background/25 px-4 py-3.5 dark:bg-white/[0.012] sm:px-5 sm:py-4">
        <div
          className={cn(
            "relative mx-auto flex w-full max-w-[900px] items-center justify-center overflow-hidden rounded-2xl border border-border/35 bg-muted/28 p-2.5 shadow-[0_12px_32px_-22px_rgba(0,0,0,0.44)] dark:border-white/[0.1] dark:bg-white/[0.035] dark:shadow-black/45",
            viewerFrameHeight,
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={activeAttachment.id}
              initial={
                prefersReducedMotion
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 10, scale: 0.985 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: -10, scale: 0.985 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }
              }
              className="relative h-full w-full"
            >
              <div className="relative h-full w-full rounded-[10px] border border-border/35 bg-background/55 dark:border-white/[0.08] dark:bg-black/25">
                <Image
                  src={activeAttachment.url}
                  alt={activeAttachment.name || "Uploaded image"}
                  fill
                  sizes="(max-width: 768px) 94vw, 900px"
                  loading="eager"
                  decoding="async"
                  className="rounded-[10px] object-contain"
                />
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      {hasMultipleImages ? (
        <div className="shrink-0 border-t border-border/20 bg-background/52 px-4 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-white/[0.02] sm:px-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {imageAttachments.map((attachment, index) => {
              const isActive = index === safeIndex;
              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "group/thumb relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-muted/25 transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-white/[0.03] sm:h-16 sm:w-16",
                    isActive
                      ? "border-sky-500/38 dark:border-sky-400/32 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]"
                      : "border-border/35 hover:border-foreground/[0.22] dark:border-white/[0.12] dark:hover:border-white/[0.24]",
                  )}
                  aria-label={`View image ${index + 1}`}
                  aria-current={isActive}
                >
                  {isActive ? (
                    <div className={cn(accentOutlineClass, "rounded-xl")} />
                  ) : null}
                  <Image
                    src={attachment.url}
                    alt={attachment.name || "Uploaded image"}
                    fill
                    sizes="80px"
                    className="object-cover transition-transform duration-300 group-hover/thumb:scale-[1.04]"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "mb-2 grid gap-2.5",
          totalImages === 1 && "grid-cols-1 max-w-[360px]",
          totalImages === 2 && "grid-cols-2",
          totalImages >= 3 && "grid-cols-3",
        )}
      >
        {imageAttachments.map((attachment, index) => (
          <m.button
            key={attachment.id}
            type="button"
            initial={
              prefersReducedMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 6, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { delay: Math.min(index * 0.04, 0.14), duration: 0.24 }
            }
            onClick={() => openViewer(index)}
            aria-label={`Open image ${index + 1} in viewer`}
            className="group relative overflow-hidden rounded-2xl border border-foreground/[0.09] bg-foreground/[0.03] text-left transition-[border-color,transform] duration-300 hover:border-sky-500/35 dark:hover:border-sky-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className={cn("relative w-full", totalImages === 1 ? "aspect-[4/3]" : "aspect-square sm:aspect-[4/3]")}>
              <Image
                src={attachment.url}
                alt={attachment.name || "Uploaded image"}
                fill
                sizes="(max-width: 640px) 84vw, (max-width: 1024px) 46vw, 340px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <span className="truncate text-[10px] font-semibold text-white/95">
                {attachment.name || `Image ${index + 1}`}
              </span>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/20">
                <Expand className="h-3.5 w-3.5 text-white/88" />
              </div>
            </div>
          </m.button>
        ))}
      </div>

      {isMobile ? (
        <Sheet open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="flex h-[min(80dvh,700px)] flex-col gap-0 rounded-t-[24px] border-t border-border/35 bg-background/95 p-0 shadow-2xl dark:border-white/[0.12] dark:bg-[oklch(0.185_0_0)]"
          >
            <SheetTitle className="sr-only">Image viewer</SheetTitle>
            {viewerBody}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <DialogContent
            showCloseButton={false}
            className="flex h-[min(80vh,700px)] w-[min(980px,94vw)] flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/95 p-0 shadow-2xl dark:border-white/[0.12] dark:shadow-black/60 dark:bg-[oklch(0.185_0_0)]"
          >
            <DialogTitle className="sr-only">Image viewer</DialogTitle>
            {viewerBody}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
});
