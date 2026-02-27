"use client";

import Image from "next/image";
import { ImageOff, X } from "lucide-react";
import type { ChatMessage } from "@edward/shared/chat/types";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import { AnimatePresence, m } from "motion/react";

export type FailedImageState = Record<string, true>;
export type ImageAttachment = NonNullable<ChatMessage["attachments"]>[number];

export const accentOutlineClass =
  "pointer-events-none absolute -inset-[2px] sm:-inset-[3px] rounded-[8px] sm:rounded-[10px] border border-sky-500/40 dark:border-sky-400/30";

export function getAttachmentLabel(
  attachment: ImageAttachment,
  index: number,
): string {
  return attachment.name || `Image ${index + 1}`;
}

export function pruneFailedImageIds(
  prev: FailedImageState,
  attachments: ImageAttachment[],
): FailedImageState {
  const prevIds = Object.keys(prev);
  if (prevIds.length === 0) {
    return prev;
  }

  const validIds = new Set(attachments.map((attachment) => attachment.id));
  const next: FailedImageState = {};

  let keptCount = 0;
  for (const id of prevIds) {
    if (!validIds.has(id)) {
      continue;
    }
    next[id] = true;
    keptCount += 1;
  }

  return keptCount === prevIds.length ? prev : next;
}

function UnavailableContent({
  label,
  variant,
}: {
  label: string;
  variant: "compact" | "default" | "viewer";
}) {
  const isCompact = variant === "compact";
  const isViewer = variant === "viewer";

  return (
    <div className={cn("flex flex-col items-center text-center", isCompact ? "gap-1.5" : "gap-2.5")}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-background/85 text-muted-foreground",
          isCompact ? "h-7 w-7" : isViewer ? "h-9 w-9" : "h-8 w-8",
        )}
      >
        <ImageOff className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      </div>
      <div className={cn(isViewer ? "max-w-[92%]" : "max-w-[88%]")}>
        <p className={cn("font-medium text-foreground/80", isViewer ? "text-sm" : isCompact ? "text-[10px]" : "text-[11px]")}>
          Image unavailable
        </p>
        {!isCompact ? (
          <p
            className={cn(
              "line-clamp-2 text-muted-foreground",
              isViewer ? "mx-auto text-xs" : "mt-0.5 text-[10px]",
            )}
            title={label}
          >
            {label}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ImageUnavailableTile({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-muted/35 dark:bg-white/[0.03]",
        compact ? "p-1.5" : "p-2.5",
      )}
    >
      <UnavailableContent label={label} variant={compact ? "compact" : "default"} />
    </div>
  );
}

function ViewerUnavailableState({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted/30 p-4 dark:bg-white/[0.02]">
      <UnavailableContent label={label} variant="viewer" />
    </div>
  );
}

export function ThumbnailImageContent({
  unavailable,
  label,
  src,
  alt,
  sizes,
  className,
  compactFallback = false,
  onError,
  onLoad,
  loading,
}: {
  unavailable: boolean;
  label: string;
  src: string;
  alt: string;
  sizes: string;
  className: string;
  compactFallback?: boolean;
  onError: () => void;
  onLoad: () => void;
  loading: "lazy" | "eager";
}) {
  if (unavailable) {
    return <ImageUnavailableTile label={label} compact={compactFallback} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      loading={loading}
      decoding="async"
      onError={onError}
      onLoad={onLoad}
    />
  );
}

export function ViewerBody({
  attachments,
  activeIndex,
  unavailable,
  onSelect,
  onClose,
  onImageError,
  onImageLoad,
  prefersReducedMotion,
  isMobile,
}: {
  attachments: ImageAttachment[];
  activeIndex: number;
  unavailable: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
  onImageError: (id: string) => void;
  onImageLoad: (id: string) => void;
  prefersReducedMotion: boolean;
  isMobile: boolean;
}) {
  const totalImages = attachments.length;
  const hasMultipleImages = totalImages > 1;
  const activeAttachment = attachments[activeIndex]!;
  const activeLabel = getAttachmentLabel(activeAttachment, activeIndex);
  const viewerFrameHeight = isMobile
    ? "h-[min(43dvh,410px)]"
    : "h-[min(52vh,540px)]";

  return (
    <div className="relative flex h-full flex-col bg-background/90 dark:bg-[oklch(0.185_0_0)]">
      <div className="shrink-0 border-b border-border/20 bg-background/50 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-5 sm:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-border/45 bg-muted/45 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-foreground/72 dark:border-white/[0.14] dark:bg-white/[0.05]">
              {activeIndex + 1} of {totalImages}
            </span>
            <span className="truncate text-[11px] font-medium text-foreground/78 sm:text-xs">
              {activeLabel}
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
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
                {unavailable ? (
                  <ViewerUnavailableState label={activeLabel} />
                ) : (
                  <Image
                    src={activeAttachment.url}
                    alt={activeAttachment.name || "Uploaded image"}
                    fill
                    sizes="(max-width: 768px) 94vw, 900px"
                    loading="eager"
                    decoding="async"
                    className="rounded-[10px] object-contain"
                    onError={() => onImageError(activeAttachment.id)}
                    onLoad={() => onImageLoad(activeAttachment.id)}
                  />
                )}
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      {hasMultipleImages ? (
        <div className="shrink-0 border-t border-border/20 bg-background/52 px-4 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-white/[0.02] sm:px-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {attachments.map((attachment, index) => {
              const isActive = index === activeIndex;
              const label = getAttachmentLabel(attachment, index);
              const attachmentUnavailable = unavailable && isActive;

              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => onSelect(index)}
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

                  <ThumbnailImageContent
                    unavailable={attachmentUnavailable}
                    label={label}
                    src={attachment.url}
                    alt={attachment.name || "Uploaded image"}
                    sizes="80px"
                    className="object-cover transition-transform duration-300 group-hover/thumb:scale-[1.04]"
                    compactFallback
                    loading="lazy"
                    onError={() => onImageError(attachment.id)}
                    onLoad={() => onImageLoad(attachment.id)}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
