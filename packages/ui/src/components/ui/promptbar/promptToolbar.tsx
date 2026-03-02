import {
  ArrowRight,
  PaperclipIcon,
  EyeOff,
  X,
  Square,
  CornerDownLeft,
  Mic,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@edward/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipPositioner,
} from "@edward/ui/components/tooltip";
import { cn } from "@edward/ui/lib/utils";
import {
  type AttachedFile,
} from "./promptbar.constants";
import { IMAGE_UPLOAD_CONFIG, PROMPT_INPUT_CONFIG } from "@edward/shared/constants";

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
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  canEnhancePrompt: boolean;
  enhancePromptMinChars: number;
  isAtPromptLimit: boolean;
  onToggleVoiceInput: () => void;
  isVoiceSupported: boolean;
  isVoiceRecording: boolean;
  isSubmissionBlocked: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  disableAttachmentActions?: boolean;
  attachmentDisabledReason?: string;
}

function EnhancePromptIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("text-current", className)}
      aria-hidden="true"
    >
      <path
        d="M4.75518 5.15769C4.65005 4.94744 4.35001 4.94744 4.24488 5.15769L3.59168 6.4641C3.56407 6.51931 3.51931 6.56407 3.4641 6.59168L2.15769 7.24488C1.94744 7.35001 1.94744 7.65005 2.15769 7.75518L3.4641 8.40839C3.51931 8.43599 3.56407 8.48075 3.59168 8.53596L4.24488 9.84237C4.35001 10.0526 4.65005 10.0526 4.75518 9.84237L5.40839 8.53596C5.43599 8.48075 5.48075 8.43599 5.53596 8.40839L6.84237 7.75518C7.05262 7.65005 7.05262 7.35001 6.84237 7.24488L5.53596 6.59168C5.48075 6.56407 5.43599 6.51931 5.40839 6.4641L4.75518 5.15769Z"
        fill="currentColor"
      />
      <path
        d="M9.26447 2.16345C9.1555 1.94552 8.8445 1.94552 8.73553 2.16345L8.25558 3.12335C8.22697 3.18057 8.18057 3.22697 8.12335 3.25558L7.16345 3.73553C6.94552 3.8445 6.94552 4.1555 7.16345 4.26447L8.12335 4.74442C8.18057 4.77303 8.22697 4.81943 8.25558 4.87665L8.73553 5.83655C8.8445 6.05448 9.1555 6.05448 9.26447 5.83655L9.74442 4.87665C9.77303 4.81943 9.81943 4.77303 9.87665 4.74442L10.8365 4.26447C11.0545 4.1555 11.0545 3.8445 10.8365 3.73553L9.87665 3.25558C9.81943 3.22697 9.77303 3.18057 9.74442 3.12335L9.26447 2.16345Z"
        fill="currentColor"
      />
      <path
        d="M18.7551 15.1577C18.65 14.9474 18.35 14.9474 18.2449 15.1577L17.5917 16.4641C17.5641 16.5193 17.5193 16.5641 17.4641 16.5917L16.1577 17.2449C15.9474 17.35 15.9474 17.65 16.1577 17.7551L17.4641 18.4083C17.5193 18.4359 17.5641 18.4807 17.5917 18.5359L18.2449 19.8423C18.35 20.0526 18.65 20.0526 18.7551 19.8423L19.4083 18.5359C19.4359 18.4807 19.4807 18.4359 19.5359 18.4083L20.8423 17.7551C21.0526 17.65 21.0526 17.35 20.8423 17.2449L19.5359 16.5917C19.4807 16.5641 19.4359 16.5193 19.4083 16.4641L18.7551 15.1577Z"
        fill="currentColor"
      />
      <path
        d="M3.75 20.2498V17.4925C3.75 16.6968 4.06607 15.9337 4.62868 15.3711L15.5 4.49981C16.6046 3.39524 18.3954 3.39524 19.5 4.49981C20.6046 5.60438 20.6046 7.39525 19.5 8.49981L8.62868 19.3711C8.06607 19.9337 7.30301 20.2498 6.50736 20.2498H3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  onEnhancePrompt,
  isEnhancingPrompt,
  canEnhancePrompt,
  enhancePromptMinChars,
  isAtPromptLimit,
  onToggleVoiceInput,
  isVoiceSupported,
  isVoiceRecording,
  isSubmissionBlocked,
  isStreaming,
  onCancel,
  disabled,
  disableAttachmentActions,
  attachmentDisabledReason,
}: PromptToolbarProps) {
  const handleAction = isStreaming ? onCancel : onProtectedAction;

  const ActionButton = isMobile ? (
    <Button
      type="button"
      size="icon"
      className={cn(
        "rounded-full transition-all duration-300 transform active:scale-95 h-8 w-8 sm:h-9 sm:w-9",
        isStreaming
          ? "bg-foreground/10 hover:bg-foreground/20 text-foreground"
          : "bg-foreground text-background hover:opacity-90",
      )}
      onClick={handleAction}
      disabled={disabled && !isStreaming}
      aria-label={isStreaming ? "Stop generation" : "Build now"}
    >
      {isStreaming ? (
        <Square className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
      ) : (
        <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      )}
    </Button>
  ) : (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        className={cn(
          "shrink-0 rounded-xl gap-2 px-3 py-2.5 text-sm font-semibold transition-all duration-300 transform active:scale-95 border-none",
          isStreaming
            ? "bg-foreground/10 hover:bg-foreground/20 text-foreground"
            : "bg-foreground text-background hover:brightness-110 shadow-md",
        )}
        onClick={handleAction}
        disabled={disabled && !isStreaming}
      >
        {isStreaming ? (
          <>
            Stop
            <Square className="h-3.5 w-3.5 fill-current" />
          </>
        ) : (
          <>
            Build now
            <span
              className={cn(
                "ml-0.5 inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-[7px] px-1",
                "border border-black/15 bg-gradient-to-b from-black/[0.03] via-black/[0.08] to-black/[0.14]",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.38),inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_1.5px_rgba(0,0,0,0.2)]",
              )}
              aria-hidden="true"
            >
              <CornerDownLeft className="size-3 stroke-[2.15] text-zinc-300 dark:text-zinc-600" />
            </span>
          </>
        )}
      </Button>
    </div>
  );

  const attachmentTooltip = !isAuthenticated
    ? "Sign in to attach images"
    : !supportsVision
      ? "Vision not supported"
      : disableAttachmentActions
        ? attachmentDisabledReason || "Image uploads are currently unavailable."
        : `Attach images${attachedFiles.length > 0 ? ` (${attachedFiles.length}/${IMAGE_UPLOAD_CONFIG.MAX_FILES})` : ""}`;
  const promptEnhanceTooltip = disabled
    ? "Prompt enhancement unavailable right now."
    : isEnhancingPrompt
      ? "Enhancing prompt..."
      : isAtPromptLimit
        ? `Prompt is at the ${PROMPT_INPUT_CONFIG.MAX_CHARS}-character limit. Shorten it to enhance.`
        : !canEnhancePrompt
          ? `Write at least ${enhancePromptMinChars} characters to enhance prompt.`
          : "Enhance prompt";
  const voiceTooltip = !isVoiceSupported
    ? "Voice input is not supported in this browser."
    : isSubmissionBlocked
      ? "Voice input is unavailable while generation is blocked."
      : isVoiceRecording
        ? "Listening... tap to stop"
        : "Start voice input";

  return (
    <div className="flex items-center justify-between px-3 py-3 sm:px-4 sm:py-3 md:px-6 md:py-4 bg-transparent relative z-20">
      <div className="flex items-center gap-2 sm:gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-foreground/5 hover:bg-foreground/8 transition-all duration-200 border border-border/50",
                  disabled && "opacity-60",
                )}
                onClick={onEnhancePrompt}
                disabled={
                  disabled || isEnhancingPrompt || !canEnhancePrompt
                }
                aria-label="Enhance prompt"
              >
                {isEnhancingPrompt ? (
                  <LoaderIcon className="h-4 w-4 text-foreground/70 animate-spin" />
                ) : (
                  <EnhancePromptIcon className="h-4 w-4 text-foreground/70" />
                )}
              </Button>
            }
          />
          <TooltipPositioner side="top" align="center">
            <TooltipContent>{promptEnhanceTooltip}</TooltipContent>
          </TooltipPositioner>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "relative h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-foreground/5 hover:bg-foreground/8 transition-all duration-200 border border-border/50",
                  isVoiceRecording &&
                    "bg-sky-500/15 border-sky-500/30 text-sky-500 hover:bg-sky-500/20",
                )}
                onClick={onToggleVoiceInput}
                disabled={!isVoiceSupported || isSubmissionBlocked}
                aria-label={isVoiceRecording ? "Stop voice input" : "Start voice input"}
              >
                {isVoiceRecording ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <Mic className="h-4 w-4 text-foreground/70" />
                )}
              </Button>
            }
          />
          <TooltipPositioner side="top" align="center">
            <TooltipContent>{voiceTooltip}</TooltipContent>
          </TooltipPositioner>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.join(",")}
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
                    "h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-foreground/5 hover:bg-foreground/8 transition-all duration-200 border border-border/50",
                    !supportsVision &&
                      "opacity-40 cursor-not-allowed grayscale",
                  )}
                  onClick={onAttachmentClick}
                  disabled={
                    !isAuthenticated ||
                    !supportsVision ||
                    disableAttachmentActions
                  }
                >
                  {isAuthenticated && supportsVision ? (
                    <PaperclipIcon className="h-4 w-4 text-foreground/70" />
                  ) : !supportsVision ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground/50" />
                  ) : (
                    <PaperclipIcon className="h-4 w-4 text-muted-foreground/70" />
                  )}
                </Button>
              </div>
            }
          />
          <TooltipPositioner side="top" align="center">
            <TooltipContent>{attachmentTooltip}</TooltipContent>
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
                  className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-red-500/5 hover:bg-red-500/15 text-red-500/60 hover:text-red-500 transition-all border border-red-500/10"
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
