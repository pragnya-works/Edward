import { ArrowRight, PaperclipIcon, EyeOff, X, Square } from "lucide-react";
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
  isStreaming?: boolean;
  onCancel?: () => void;
  isSearchEnabled?: boolean;
  onSearchToggle?: (enabled: boolean) => void;
  disabled?: boolean;
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
  isStreaming,
  onCancel,
  disabled,
}: PromptToolbarProps) {
  const handleAction = isStreaming ? onCancel : onProtectedAction;

  const ActionButton = isMobile ? (
    <Button
      type="button"
      size="icon"
      className={cn(
        "rounded-full transition-all duration-300 transform active:scale-95",
        isStreaming
          ? "bg-foreground/10 hover:bg-foreground/20 text-foreground"
          : "bg-foreground text-background hover:opacity-90"
      )}
      onClick={handleAction}
      disabled={disabled && !isStreaming}
      aria-label={isStreaming ? "Stop generation" : "Build now"}
    >
      {isStreaming ? (
        <Square className="h-4 w-4 fill-current" />
      ) : (
        <ArrowRight className="h-4 w-4" />
      )}
    </Button>
  ) : (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        className={cn(
          "shrink-0 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 transform active:scale-95 border-none",
          isStreaming
            ? "bg-foreground/10 hover:bg-foreground/20 text-foreground"
            : "bg-foreground text-background hover:brightness-110 shadow-md"
        )}
        onClick={handleAction}
        disabled={disabled && !isStreaming}
      >
        {isStreaming ? (
          <>
            Stop
            <Square className="ml-2 h-3.5 w-3.5 fill-current" />
          </>
        ) : (
          <>
            Build now
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </div>
  );

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-transparent relative z-20">
      <div className="flex items-center gap-3">
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
                    "h-10 w-10 shrink-0 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.08] transition-all duration-200 border border-border/50",
                    !supportsVision && "opacity-40 cursor-not-allowed grayscale",
                  )}
                  onClick={onAttachmentClick}
                  disabled={!isAuthenticated || !supportsVision}
                >
                  {isAuthenticated && supportsVision ? (
                    <PaperclipIcon className="h-4.5 w-4.5 text-foreground/70" />
                  ) : !supportsVision ? (
                    <EyeOff className="h-4.5 w-4.5 text-muted-foreground/50" />
                  ) : (
                    <PaperclipIcon className="h-4.5 w-4.5 text-muted-foreground/70" />
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
                  ? "Vision not supported"
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
                  className="h-10 w-10 shrink-0 rounded-full bg-red-500/5 hover:bg-red-500/15 text-red-500/60 hover:text-red-500 transition-all border border-red-500/10"
                  onClick={onClearAllFiles}
                  aria-label="Clear all attachments"
                >
                  <X className="h-4.5 w-4.5" />
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
