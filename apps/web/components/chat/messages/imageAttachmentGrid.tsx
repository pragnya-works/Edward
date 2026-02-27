"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { m, useReducedMotion } from "motion/react";
import { Expand } from "lucide-react";
import { MessageAttachmentType, type ChatMessage } from "@edward/shared/chat/types";
import { cn } from "@edward/ui/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@edward/ui/components/dialog";
import { Sheet, SheetContent, SheetTitle } from "@edward/ui/components/sheet";
import { useIsMobile } from "@edward/ui/hooks/useMobile";
import {
  ViewerBody,
  ThumbnailImageContent,
  getAttachmentLabel,
  pruneFailedImageIds,
  type FailedImageState,
} from "./imageAttachmentGrid.viewer";

interface ImageAttachmentGridProps {
  attachments: NonNullable<ChatMessage["attachments"]>;
}

export const ImageAttachmentGrid = memo(function ImageAttachmentGrid({
  attachments,
}: ImageAttachmentGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImageIds, setFailedImageIds] = useState<FailedImageState>({});

  const imageAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment) => attachment.type === MessageAttachmentType.IMAGE,
      ),
    [attachments],
  );

  useEffect(() => {
    setFailedImageIds((prev) => pruneFailedImageIds(prev, imageAttachments));
  }, [imageAttachments]);

  useEffect(() => {
    if (activeIndex >= imageAttachments.length) {
      setActiveIndex(Math.max(0, imageAttachments.length - 1));
    }
  }, [activeIndex, imageAttachments.length]);

  const setImageFailure = useCallback((attachmentId: string, failed: boolean) => {
    setFailedImageIds((prev) => {
      const wasFailed = Boolean(prev[attachmentId]);
      if (wasFailed === failed) {
        return prev;
      }

      if (failed) {
        return { ...prev, [attachmentId]: true };
      }

      const next = { ...prev };
      delete next[attachmentId];
      return next;
    });
  }, []);

  const markImageFailed = useCallback(
    (attachmentId: string) => setImageFailure(attachmentId, true),
    [setImageFailure],
  );
  const clearImageFailure = useCallback(
    (attachmentId: string) => setImageFailure(attachmentId, false),
    [setImageFailure],
  );

  const isUnavailable = useCallback(
    (attachmentId: string) => Boolean(failedImageIds[attachmentId]),
    [failedImageIds],
  );

  if (imageAttachments.length === 0) {
    return null;
  }

  const safeIndex =
    activeIndex >= 0 && activeIndex < imageAttachments.length ? activeIndex : 0;
  const activeAttachment = imageAttachments[safeIndex]!;

  const viewerBody = (
    <ViewerBody
      attachments={imageAttachments}
      activeIndex={safeIndex}
      unavailable={isUnavailable(activeAttachment.id)}
      onSelect={setActiveIndex}
      onClose={() => setIsViewerOpen(false)}
      onImageError={markImageFailed}
      onImageLoad={clearImageFailure}
      prefersReducedMotion={Boolean(prefersReducedMotion)}
      isMobile={Boolean(isMobile)}
    />
  );

  return (
    <>
      <div
        className={cn(
          "mb-2 grid gap-2.5",
          imageAttachments.length === 1 && "grid-cols-1 max-w-[360px]",
          imageAttachments.length === 2 && "grid-cols-2",
          imageAttachments.length >= 3 && "grid-cols-3",
        )}
      >
        {imageAttachments.map((attachment, index) => {
          const label = getAttachmentLabel(attachment, index);
          const attachmentUnavailable = isUnavailable(attachment.id);

          return (
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
              onClick={() => {
                setActiveIndex(index);
                setIsViewerOpen(true);
              }}
              aria-label={`Open image ${index + 1} in viewer`}
              className="group relative overflow-hidden rounded-2xl border border-foreground/[0.09] bg-foreground/[0.03] text-left transition-[border-color,transform] duration-300 hover:border-sky-500/35 dark:hover:border-sky-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className={cn("relative w-full", imageAttachments.length === 1 ? "aspect-[4/3]" : "aspect-square sm:aspect-[4/3]")}>
                <ThumbnailImageContent
                  unavailable={attachmentUnavailable}
                  label={label}
                  src={attachment.url}
                  alt={attachment.name || "Uploaded image"}
                  sizes="(max-width: 640px) 84vw, (max-width: 1024px) 46vw, 340px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                  loading="lazy"
                  onError={() => markImageFailed(attachment.id)}
                  onLoad={() => clearImageFailure(attachment.id)}
                />

                {!attachmentUnavailable ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <span className="truncate text-[10px] font-semibold text-white/95">
                        {label}
                      </span>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/20">
                        <Expand className="h-3.5 w-3.5 text-white/88" />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </m.button>
          );
        })}
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
