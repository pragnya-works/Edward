import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  RefObject,
} from "react";
import { Card } from "@edward/ui/components/card";
import { Textarea } from "@edward/ui/components/textarea";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { BYOK } from "@edward/ui/components/ui/byok";
import { PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import { cn } from "@edward/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@edward/ui/components/tooltip";
import {
  SUGGESTIONS,
  type AttachedFile,
  type PromptbarApiKeyController,
} from "./promptbar.constants";
import { DragDropOverlay } from "./dragDropOverlay";
import { ImagePreviewStrip } from "./imagePreviewStrip";
import { PromptToolbar } from "./promptToolbar";
import { UrlSourceStrip } from "./urlSourceStrip";

interface PromptbarAuthModel {
  isAuthenticated: boolean;
  onSignIn?: () => void | Promise<void>;
  hasApiKey: boolean | null;
  apiKeyError: string;
  isApiKeyRateLimited: boolean;
  apiKeyRateLimitMessage: string;
  preferredModel?: string;
  keyPreview?: string | null;
  onSaveApiKey?: PromptbarApiKeyController["onSaveApiKey"];
}

interface PromptbarViewModel {
  detectedSourceUrls: string[];
  promptHelperMessage: string | null;
  hideSuggestions: boolean;
  suggestionIndex: number;
  inputValue: string;
  promptCharCount: number;
  promptCounterToneClass: string;
  promptTooltipToneClass: string;
  promptTooltipTextToneClass: string;
  promptProgressTrackClass: string;
  promptProgressClass: string;
  promptUsageRatio: number;
  promptCharsLeft: number;
  isSubmissionBlocked: boolean;
  isSubmitDisabled: boolean;
  isStreaming: boolean;
  supportsVision: boolean;
  isMobile: boolean;
  showLoginModal: boolean;
  showBYOK: boolean;
  isEnhancingPrompt: boolean;
  canEnhancePrompt: boolean;
  enhancePromptMinChars: number;
  isAtPromptLimit: boolean;
  isVoiceSupported: boolean;
  isVoiceRecording: boolean;
  disableAttachmentActions: boolean;
  attachmentDisabledReason: string | null;
  submissionDisabledReason?: string;
}

interface PromptbarFilesModel {
  attachedFiles: AttachedFile[];
  isDragging: boolean;
  canAttachMore: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleClearAllFiles: () => void;
  handleRemoveFile: (id: string) => void;
  handleDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handleAttachmentClick: () => void;
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}

interface PromptbarActionsModel {
  onInputValueChange: (nextValue: string) => void;
  onProtectedAction: () => void;
  onEnhancePrompt: () => void;
  onToggleVoiceInput: () => void;
  onByokValidate: () => void;
  onShowLoginModalChange: (open: boolean) => void;
  onShowBYOKChange: (open: boolean) => void;
  onCancel?: () => void;
}

export interface PromptbarLayoutModel {
  auth: PromptbarAuthModel;
  view: PromptbarViewModel;
  files: PromptbarFilesModel;
  actions: PromptbarActionsModel;
  refs: {
    promptInputRef: RefObject<HTMLTextAreaElement | null>;
  };
}

interface PromptbarLayoutProps {
  model: PromptbarLayoutModel;
}

export function PromptbarLayout({ model }: PromptbarLayoutProps) {
  const { auth, view, files, actions } = model;

  return (
    <div className="relative w-full">
      <UrlSourceStrip urls={view.detectedSourceUrls} />
      <Card
        className={cn(
          "w-full rounded-2xl py-0 overflow-hidden transition-all duration-500",
          auth.isAuthenticated
            ? "border border-sky-400/30 bg-card/80 dark:bg-card/35 backdrop-blur-3xl shadow-sm ring-1 ring-sky-400/20"
            : "border border-white/20 bg-zinc-100/70 dark:bg-zinc-900/70 backdrop-blur-3xl shadow-sm ring-1 ring-white/10",
        )}
      >
        <div
          className={cn(
            "flex flex-col relative transition-all duration-200",
            files.isDragging && "bg-sky-500/10",
          )}
          onDragEnter={files.handleDragEnter}
          onDragLeave={files.handleDragLeave}
          onDragOver={files.handleDragOver}
          onDrop={files.handleDrop}
        >
          {files.isDragging ? <DragDropOverlay /> : null}

          <ImagePreviewStrip
            attachedFiles={files.attachedFiles}
            canAttachMore={files.canAttachMore}
            onRemoveFile={files.handleRemoveFile}
            onAddMore={files.handleAttachmentClick}
          />

          <div className="relative">
            {!view.inputValue.trim() &&
              files.attachedFiles.length === 0 &&
              !view.hideSuggestions ? (
              <div className="absolute inset-0 pointer-events-none z-0">
                <TextAnimate
                  key={view.suggestionIndex}
                  animation="blurInUp"
                  by="word"
                  className="text-xs sm:text-sm md:text-[15px] text-muted-foreground font-medium leading-relaxed tracking-tight p-3 sm:p-4 md:p-6"
                  text={SUGGESTIONS[view.suggestionIndex]!}
                />
              </div>
            ) : null}
            <div className="absolute right-3 top-2.5 z-20 sm:right-4 sm:top-3 md:right-6 md:top-4">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-live="polite"
                      aria-label={`Prompt characters ${view.promptCharCount} of ${PROMPT_INPUT_CONFIG.MAX_CHARS}`}
                      className={cn(
                        "rounded-md bg-card/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur-sm sm:text-[11px]",
                        view.promptCounterToneClass,
                      )}
                    >
                      {view.promptCharCount}/{PROMPT_INPUT_CONFIG.MAX_CHARS}
                    </button>
                  }
                />
                <TooltipPositioner side="top" align="end">
                  <TooltipContent
                    className={cn(
                      "max-w-56 px-2.5 py-1.5",
                      view.promptTooltipToneClass,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 28 28"
                        aria-hidden="true"
                        className="-rotate-90"
                      >
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          className={view.promptProgressTrackClass}
                          strokeWidth="2.5"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          className={view.promptProgressClass}
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          style={{
                            strokeDasharray: `${2 * Math.PI * 11}`,
                            strokeDashoffset: `${(2 * Math.PI * 11) * (1 - view.promptUsageRatio)}`,
                            transition: "stroke-dashoffset 200ms ease",
                          }}
                        />
                      </svg>
                      <p
                        className={cn(
                          "text-[11px] leading-tight",
                          view.promptTooltipTextToneClass,
                        )}
                      >
                        <span className="font-semibold">{view.promptCharsLeft}</span>{" "}
                        chars left. Short prompts are usually faster and more
                        reliable.
                      </p>
                    </div>
                  </TooltipContent>
                </TooltipPositioner>
              </Tooltip>
            </div>
            <Textarea
              ref={model.refs.promptInputRef}
              data-edward-prompt-input="true"
              placeholder={view.hideSuggestions ? "Ask Edward anything..." : ""}
              value={view.inputValue}
              maxLength={PROMPT_INPUT_CONFIG.MAX_CHARS}
              onChange={(event) => actions.onInputValueChange(event.target.value)}
              disabled={view.isSubmissionBlocked}
              onKeyDown={(event) => {
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing
                ) {
                  return;
                }
                event.preventDefault();
                if (
                  view.isSubmitDisabled ||
                  view.isStreaming ||
                  view.submissionDisabledReason
                ) {
                  return;
                }
                actions.onProtectedAction();
              }}
              onPaste={files.handlePaste}
              className="min-h-[6rem] sm:min-h-[7rem] md:min-h-[8rem] max-h-40 sm:max-h-52 md:max-h-64 overflow-y-auto resize-none border-0 bg-transparent p-3 pr-16 sm:p-4 sm:pr-20 md:p-6 md:pr-24 text-sm sm:text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10 font-medium leading-relaxed tracking-tight"
            />
          </div>

          <PromptToolbar
            isMobile={view.isMobile}
            isAuthenticated={auth.isAuthenticated}
            supportsVision={view.supportsVision}
            canAttachMore={files.canAttachMore}
            attachedFiles={files.attachedFiles}
            fileInputRef={files.fileInputRef}
            onAttachmentClick={files.handleAttachmentClick}
            onFileInputChange={files.handleFileInputChange}
            onClearAllFiles={files.handleClearAllFiles}
            onProtectedAction={actions.onProtectedAction}
            onEnhancePrompt={actions.onEnhancePrompt}
            isEnhancingPrompt={view.isEnhancingPrompt}
            canEnhancePrompt={view.canEnhancePrompt}
            enhancePromptMinChars={view.enhancePromptMinChars}
            isAtPromptLimit={view.isAtPromptLimit}
            onToggleVoiceInput={actions.onToggleVoiceInput}
            isVoiceSupported={view.isVoiceSupported}
            isVoiceRecording={view.isVoiceRecording}
            isSubmissionBlocked={view.isSubmissionBlocked}
            isStreaming={view.isStreaming}
            onCancel={actions.onCancel}
            disabled={view.isSubmitDisabled || Boolean(view.submissionDisabledReason)}
            disableAttachmentActions={view.disableAttachmentActions}
            attachmentDisabledReason={view.attachmentDisabledReason || undefined}
          />
        </div>
        <LoginModal
          isOpen={view.showLoginModal}
          onClose={() => actions.onShowLoginModalChange(false)}
          onSignIn={auth.onSignIn}
        />
        {auth.isAuthenticated ? (
          <BYOK
            controller={{
              modal: {
                isOpen: view.showBYOK,
                onClose: () => actions.onShowBYOKChange(false),
              },
              actions: {
                onValidate: actions.onByokValidate,
                onSaveApiKey: auth.onSaveApiKey,
              },
              state: {
                preferredModel: auth.preferredModel,
                keyPreview: auth.keyPreview,
                hasExistingKey: auth.hasApiKey === true,
                error: auth.apiKeyError,
                isRateLimited: auth.isApiKeyRateLimited,
                rateLimitMessage: auth.apiKeyRateLimitMessage,
              },
            }}
          />
        ) : null}
      </Card>
      {view.promptHelperMessage ? (
        <p className="mt-2 px-1 text-center text-[11px] font-medium text-amber-600/90 sm:px-2">
          {view.promptHelperMessage}
        </p>
      ) : null}
    </div>
  );
}
