import { X, AlertCircle, LoaderIcon } from "lucide-react";
import Image from "next/image";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
} from "motion/react";
import {
  isUploading,
  isUploadFailed,
  type AttachedFile,
} from "./promptbar.constants";
import { Button } from "@edward/ui/components/button";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

interface ImagePreviewStripProps {
  attachedFiles: AttachedFile[];
  canAttachMore: boolean;
  onRemoveFile: (id: string) => void;
  onAddMore: () => void;
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ImagePreviewStrip({
  attachedFiles,
  canAttachMore,
  onRemoveFile,
  onAddMore,
}: ImagePreviewStripProps) {
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        {attachedFiles.length > 0 && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 border-b border-border/10 dark:bg-input/30">
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide px-2 py-5">
                {attachedFiles.map((file, index) => (
                  <m.div
                    key={file.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative flex-shrink-0"
                  >
                    <div className="relative h-18 w-18 rounded-xl overflow-hidden border border-border/50 shadow shadow-black/10 dark:shadow-black/20 ring-1 ring-border/20 bg-foreground/[0.05]">
                      <Image
                        src={file.preview}
                        alt={file.file.name}
                        fill
                        unoptimized
                        sizes="72px"
                        className="object-cover"
                      />
                      {isUploading(file) && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5">
                          <LoaderIcon className="h-5 w-5 animate-spin" />
                        </div>
                      )}
                      {isUploadFailed(file) && (
                        <div className="absolute left-1 bottom-1 rounded-full bg-red-500/90 p-0.5">
                          <AlertCircle className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveFile(file.id)}
                        className="absolute top-1 right-1 h-5.5 w-5.5 rounded-full bg-black/60 dark:bg-black/80 backdrop-blur-md hover:bg-black/90 text-white/90 hover:text-white transition-all duration-150 border border-white/10 dark:border-white/5"
                        aria-label={`Remove ${file.file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </m.div>
                ))}
                {canAttachMore && (
                  <m.button
                    type="button"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: attachedFiles.length * 0.05 }}
                    onClick={onAddMore}
                    className="flex-shrink-0 h-18 w-18 rounded-xl bg-foreground/[0.03] dark:bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-all flex items-center justify-center cursor-pointer border border-dashed border-border group/add"
                    aria-label="Add more images"
                  >
                    <PlusIcon className="h-6 w-6 text-muted-foreground/40 group-hover/add:text-sky-500 dark:group-hover/add:text-sky-400 group-hover/add:scale-110 transition-all" />
                  </m.button>
                )}
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 dark:text-muted-foreground/50 pl-2">
                  {attachedFiles.length} / {IMAGE_UPLOAD_CONFIG.MAX_FILES}
                </span>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
