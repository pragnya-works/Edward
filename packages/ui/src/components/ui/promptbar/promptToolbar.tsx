import { ArrowRight, PaperclipIcon, EyeOff, X } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipPositioner,
} from "@edward/ui/components/tooltip";
import { cn } from "@edward/ui/lib/utils";
import { ACCEPTED_IMAGE_TYPES, MAX_FILES, type AttachedFile } from "./promptbar.constants";

interface PromptToolbarProps {
  isMobile: boolean;
  isAuthenticated: boolean;
  supportsVision: boolean;
  canAttachMore: boolean;
  attachedFiles: AttachedFile[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAttachmentClick: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAllFiles: () => void;
  onProtectedAction: () => void;
}

export function PromptToolbar({
  isMobile,
  isAuthenticated,
  supportsVision,
  canAttachMore,
  attachedFiles,
  fileInputRef,
  onAttachmentClick,
  onFileInputChange,
  onClearAllFiles,
  onProtectedAction,
}: PromptToolbarProps) {
  const ActionButton = isMobile ? (
    <Button
      type="button"
      size="icon"
      className="rounded-full"
      onClick={onProtectedAction}
      aria-label="Build now"
    >
      <ArrowRight className="h-3.5 w-3.5" />
    </Button>
  ) : (
    <Button
      type="button"
      className="shrink-0 rounded-full px-5 py-2 text-sm font-medium shadow-sm"
      onClick={onProtectedAction}
    >
      Build now
      <ArrowRight className="ml-1 h-3.5 w-3.5" />
    </Button>
  );

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-input/30">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  multiple={canAttachMore}
                  onChange={onFileInputChange}
                  className="sr-only"
                  aria-label="Attach images"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full p-0 bg-input/80",
                    (!isAuthenticated || !supportsVision) &&
                    "opacity-50 cursor-not-allowed",
                  )}
                  onClick={onAttachmentClick}
                  disabled={!isAuthenticated || !supportsVision}
                  aria-label={
                    isAuthenticated && supportsVision
                      ? "Attach images"
                      : !supportsVision
                        ? "Vision not supported"
                        : "Sign in to attach images"
                  }
                >
                  {isAuthenticated && supportsVision ? (
                    <PaperclipIcon className="h-4 w-4 text-foreground" />
                  ) : !supportsVision ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <PaperclipIcon className="h-4 w-4 text-muted-foreground/50" />
                  )}
                </Button>
              </div>
            }
          />
          <TooltipPositioner side="top" align="center">
            <TooltipContent>
              {!isAuthenticated
                ? "Sign in to attach images"
                : !supportsVision
                  ? "This model doesn't support image attachments"
                  : `Attach images${attachedFiles.length > 0 ? ` (${attachedFiles.length}/${MAX_FILES})` : ""}`}
            </TooltipContent>
          </TooltipPositioner>
        </Tooltip>
        {attachedFiles.length > 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-muted"
                  onClick={onClearAllFiles}
                  aria-label="Clear all attachments"
                >
                  <X className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipPositioner side="top" align="center">
              <TooltipContent>Clear all</TooltipContent>
            </TooltipPositioner>
          </Tooltip>
        )}
      </div>
      {ActionButton}
    </div>
  );
}
