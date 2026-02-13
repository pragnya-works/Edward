import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MAX_FILES, type AttachedFile } from "./promptbar.constants";
import { Button } from "@edward/ui/components/button";

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
    <AnimatePresence mode="wait">
      {attachedFiles.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide">
              {attachedFiles.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative flex-shrink-0"
                >
                  <div className="relative h-[72px] w-[72px] rounded-lg overflow-hidden">
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveFile(file.id)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors duration-150"
                      aria-label={`Remove ${file.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    {file.file.type.startsWith("image/heic") && (
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[8px] font-medium text-white">
                        HEIC
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {canAttachMore && (
                <motion.button
                  type="button"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: attachedFiles.length * 0.05 }}
                  onClick={onAddMore}
                  className="flex-shrink-0 h-[72px] w-[72px] rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors flex items-center justify-center cursor-pointer border border-border"
                  aria-label="Add more images"
                >
                  <PlusIcon className="h-5 w-5 text-muted-foreground" />
                </motion.button>
              )}
              <span className="flex-shrink-0 text-xs text-muted-foreground pl-1">
                {attachedFiles.length}/{MAX_FILES}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
