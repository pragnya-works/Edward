"use client";

import { memo } from "react";
import { m } from "motion/react";
import Image from "next/image";
import { MessageAttachmentType, type ChatMessage } from "@edward/shared/chat/types";
import { cn } from "@edward/ui/lib/utils";

interface ImageAttachmentGridProps {
  attachments: NonNullable<ChatMessage["attachments"]>;
}

export const ImageAttachmentGrid = memo(function ImageAttachmentGrid({
  attachments,
}: ImageAttachmentGridProps) {
  const imageAttachments = attachments.filter(
    (attachment) => attachment.type === MessageAttachmentType.IMAGE,
  );

  if (imageAttachments.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid gap-2 mb-2",
        imageAttachments.length === 1 && "grid-cols-1",
        imageAttachments.length === 2 && "grid-cols-2",
        imageAttachments.length >= 3 && "grid-cols-3",
      )}
    >
      {imageAttachments.map((attachment) => (
        <m.div
          key={attachment.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-xl overflow-hidden bg-foreground/[0.03] border border-foreground/[0.05]"
        >
          <Image
            src={attachment.url}
            alt={attachment.name || "Uploaded image"}
            width={1200}
            height={800}
            sizes="(max-width: 640px) 85vw, (max-width: 1024px) 60vw, 420px"
            className="w-full h-auto max-h-48 object-cover"
            loading="lazy"
            decoding="async"
          />
        </m.div>
      ))}
    </div>
  );
});
