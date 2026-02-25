import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card } from "@edward/ui/components/card";
import { Textarea } from "@edward/ui/components/textarea";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { useIsMobile } from "@edward/ui/hooks/useMobile";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { BYOK } from "@edward/ui/components/ui/byok";
import { modelSupportsVision } from "@edward/shared/schema";
import { PROMPT_INPUT_CONFIG, UI_EVENTS } from "@edward/shared/constants";
import { cn } from "@edward/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@edward/ui/components/tooltip";
import {
  SUGGESTIONS,
  isUploaded,
  isUploading,
  type PromptbarProps,
  type UploadedImageRef,
} from "./promptbar/promptbar.constants";
import { useFileAttachments } from "./promptbar/useFileAttachments";
import { DragDropOverlay } from "./promptbar/dragDropOverlay";
import { ImagePreviewStrip } from "./promptbar/imagePreviewStrip";
import { PromptToolbar } from "./promptbar/promptToolbar";
import { UrlSourceStrip } from "./promptbar/urlSourceStrip";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const URL_SOURCE_PREVIEW_LIMIT = 6;
const PROMPT_INPUT_SELECTOR = "textarea[data-edward-prompt-input='true']";

function normalizeDetectedUrl(raw: string): string | null {
  try {
    const sanitized = raw.trim().replace(/[.,!?;:]+$/g, "");
    const parsed = new URL(sanitized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractUrlsFromPrompt(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const candidate of matches) {
    const normalized = normalizeDetectedUrl(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls.slice(0, URL_SOURCE_PREVIEW_LIMIT);
}

function resolvePromptbarProps(props: PromptbarProps) {
  if ("controller" in props) {
    const controller = props.controller;
    return {
      isAuthenticated: controller.auth?.isAuthenticated ?? false,
      onSignIn: controller.auth?.onSignIn,
      onProtectedAction: controller.submission?.onProtectedAction,
      hasApiKey: controller.apiKey?.hasApiKey ?? null,
      isApiKeyLoading: controller.apiKey?.isApiKeyLoading ?? false,
      apiKeyError: controller.apiKey?.apiKeyError ?? "",
      isApiKeyRateLimited: controller.apiKey?.isApiKeyRateLimited ?? false,
      apiKeyRateLimitMessage: controller.apiKey?.apiKeyRateLimitMessage ?? "",
      onSaveApiKey: controller.apiKey?.onSaveApiKey,
      preferredModel: controller.apiKey?.preferredModel,
      keyPreview: controller.apiKey?.keyPreview,
      selectedModelId: controller.apiKey?.selectedModelId,
      hideSuggestions: controller.submission?.hideSuggestions ?? false,
      isStreaming: controller.submission?.isStreaming ?? false,
      onCancel: controller.submission?.onCancel,
      onImageUpload: controller.attachments?.onImageUpload,
      onImageUploadError: controller.attachments?.onImageUploadError,
      submissionDisabledReason: controller.submission?.submissionDisabledReason,
      disableImageUploads: controller.attachments?.disableImageUploads ?? false,
    };
  }

  return {
    isAuthenticated: props.isAuthenticated ?? false,
    onSignIn: props.onSignIn,
    onProtectedAction: props.onProtectedAction,
    hasApiKey: props.hasApiKey ?? null,
    isApiKeyLoading: props.isApiKeyLoading ?? false,
    apiKeyError: props.apiKeyError ?? "",
    isApiKeyRateLimited: props.isApiKeyRateLimited ?? false,
    apiKeyRateLimitMessage: props.apiKeyRateLimitMessage ?? "",
    onSaveApiKey: props.onSaveApiKey,
    preferredModel: props.preferredModel,
    keyPreview: props.keyPreview,
    selectedModelId: props.selectedModelId,
    hideSuggestions: props.hideSuggestions ?? false,
    isStreaming: props.isStreaming ?? false,
    onCancel: props.onCancel,
    onImageUpload: props.onImageUpload,
    onImageUploadError: props.onImageUploadError,
    submissionDisabledReason: props.submissionDisabledReason,
    disableImageUploads: props.disableImageUploads ?? false,
  };
}

export default function Promptbar(props: PromptbarProps) {
  const {
    isAuthenticated,
    onSignIn,
    onProtectedAction,
    hasApiKey,
    isApiKeyLoading,
    apiKeyError,
    isApiKeyRateLimited,
    apiKeyRateLimitMessage,
    onSaveApiKey,
    preferredModel,
    keyPreview,
    selectedModelId,
    hideSuggestions,
    isStreaming,
    onCancel,
    onImageUpload,
    onImageUploadError,
    submissionDisabledReason,
    disableImageUploads,
  } = resolvePromptbarProps(props);

  const [inputValue, setInputValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showBYOK, setShowBYOK] = useState(false);

  const isMobile = useIsMobile();
  const initialLoadTriggered = useRef(false);

  const supportsVision = useMemo(() => {
    if (!selectedModelId) return true;
    return modelSupportsVision(selectedModelId);
  }, [selectedModelId]);
  const isSubmissionBlocked = Boolean(submissionDisabledReason) || isStreaming;
  const areImageUploadsBlocked = disableImageUploads || isSubmissionBlocked;

  const {
    attachedFiles,
    isDragging,
    fileInputRef,
    canAttachMore,
    handleFileInputChange,
    handleClearAllFiles,
    handleRemoveFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleAttachmentClick,
  } = useFileAttachments(
    isAuthenticated,
    supportsVision,
    areImageUploadsBlocked,
    onImageUpload,
    onImageUploadError,
  );

  const uploadedImages = useMemo<UploadedImageRef[]>(() => {
    return attachedFiles
      .filter((file) => isUploaded(file) && file.cdnUrl)
      .map((file) => ({
        url: file.cdnUrl!,
        mimeType: file.mimeType || file.file.type || "image/jpeg",
        name: file.file.name,
        sizeBytes: file.file.size,
      }));
  }, [attachedFiles]);

  const hasPendingUploads = useMemo(
    () => attachedFiles.some((file) => isUploading(file)),
    [attachedFiles],
  );
  const promptCharCount = inputValue.length;
  const isNearPromptCharLimit =
    promptCharCount >= PROMPT_INPUT_CONFIG.WARNING_CHARS;
  const isPromptCharLimitReached =
    promptCharCount >= PROMPT_INPUT_CONFIG.MAX_CHARS;
  const promptUsageRatio = Math.min(
    promptCharCount / PROMPT_INPUT_CONFIG.MAX_CHARS,
    1,
  );
  const promptCharsLeft = Math.max(
    PROMPT_INPUT_CONFIG.MAX_CHARS - promptCharCount,
    0,
  );
  const promptCounterToneClass = isPromptCharLimitReached
    ? "text-red-500/95"
    : isNearPromptCharLimit
      ? "text-muted-foreground"
      : "text-muted-foreground/75";
  const promptTooltipToneClass = isPromptCharLimitReached
    ? "bg-red-500 text-white [&_[data-slot=tooltip-arrow]]:bg-red-500 [&_[data-slot=tooltip-arrow]]:fill-red-500"
    : isNearPromptCharLimit
      ? "bg-zinc-700 text-zinc-100 [&_[data-slot=tooltip-arrow]]:bg-zinc-700 [&_[data-slot=tooltip-arrow]]:fill-zinc-700"
      : "";
  const promptTooltipTextToneClass = isPromptCharLimitReached
    ? "text-white/90"
    : isNearPromptCharLimit
      ? "text-zinc-100/90"
      : "text-primary-foreground/90";
  const promptProgressTrackClass = isPromptCharLimitReached
    ? "stroke-white/35"
    : isNearPromptCharLimit
      ? "stroke-zinc-100/25"
      : "stroke-primary-foreground/25";
  const promptProgressClass = isPromptCharLimitReached
    ? "stroke-white"
    : isNearPromptCharLimit
      ? "stroke-zinc-100"
      : "stroke-primary-foreground";
  const isSubmitDisabled =
    (!inputValue.trim() && uploadedImages.length === 0) || hasPendingUploads;
  const detectedSourceUrls = useMemo(
    () => extractUrlsFromPrompt(inputValue),
    [inputValue],
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      interval = setInterval(() => {
        setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
      }, 4000);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (interval) clearInterval(interval);
      } else {
        if (interval) clearInterval(interval);
        startInterval();
      }
    };
    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleProtectedAction = useCallback(() => {
    if (submissionDisabledReason) return;
    if (hasPendingUploads) return;
    if (!isAuthenticated) {
      setShowLoginModal(true);
    } else if (hasApiKey !== true) {
      if (!isApiKeyLoading) setShowBYOK(true);
    } else {
      onProtectedAction?.(inputValue, uploadedImages);
      setInputValue("");
      handleClearAllFiles();
    }
  }, [
    isAuthenticated,
    hasApiKey,
    isApiKeyLoading,
    onProtectedAction,
    inputValue,
    handleClearAllFiles,
    uploadedImages,
    hasPendingUploads,
    submissionDisabledReason,
  ]);

  useEffect(() => {
    if (
      !initialLoadTriggered.current &&
      isAuthenticated &&
      hasApiKey === false &&
      !isApiKeyLoading
    ) {
      initialLoadTriggered.current = true;
      setShowBYOK(true);
    }
  }, [isAuthenticated, hasApiKey, isApiKeyLoading]);

  useEffect(() => {
    const openApiKeyModal = () => {
      if (!isAuthenticated) {
        setShowLoginModal(true);
        return;
      }

      if (!isApiKeyLoading) {
        setShowBYOK(true);
      }
    };

    const focusPromptInput = () => {
      const input = document.querySelector(
        PROMPT_INPUT_SELECTOR,
      ) as HTMLTextAreaElement | null;
      if (!input) return;

      input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      input.focus();
    };

    window.addEventListener(UI_EVENTS.OPEN_API_KEY_MODAL, openApiKeyModal);
    window.addEventListener(UI_EVENTS.FOCUS_PROMPT_INPUT, focusPromptInput);
    return () => {
      window.removeEventListener(UI_EVENTS.OPEN_API_KEY_MODAL, openApiKeyModal);
      window.removeEventListener(UI_EVENTS.FOCUS_PROMPT_INPUT, focusPromptInput);
    };
  }, [isAuthenticated, isApiKeyLoading]);

  return (
    <div className="relative w-full">
      <UrlSourceStrip urls={detectedSourceUrls} />
      <Card
        className={cn(
          "w-full rounded-2xl py-0 overflow-hidden transition-all duration-500",
          isAuthenticated
            ? "border border-sky-400/30 bg-card/80 dark:bg-card/35 backdrop-blur-3xl shadow-sm ring-1 ring-sky-400/20"
            : "border border-white/20 bg-zinc-100/70 dark:bg-zinc-900/70 backdrop-blur-3xl shadow-sm ring-1 ring-white/10",
        )}
      >
        <div
          className={cn(
            "flex flex-col relative transition-all duration-200",
            isDragging && "bg-sky-500/10",
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isDragging && <DragDropOverlay />}

          <ImagePreviewStrip
            attachedFiles={attachedFiles}
            canAttachMore={canAttachMore}
            onRemoveFile={handleRemoveFile}
            onAddMore={handleAttachmentClick}
          />

          <div className="relative">
            {!inputValue.trim() &&
              attachedFiles.length === 0 &&
              !hideSuggestions && (
                <div className="absolute inset-0 pointer-events-none z-0">
                  <TextAnimate
                    key={suggestionIndex}
                    animation="blurInUp"
                    by="word"
                    className="text-xs sm:text-sm md:text-[15px] text-muted-foreground font-medium leading-relaxed tracking-tight p-3 sm:p-4 md:p-6"
                    text={SUGGESTIONS[suggestionIndex]!}
                  />
                </div>
              )}
            <div className="absolute right-3 top-2.5 z-20 sm:right-4 sm:top-3 md:right-6 md:top-4">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-live="polite"
                      aria-label={`Prompt characters ${promptCharCount} of ${PROMPT_INPUT_CONFIG.MAX_CHARS}`}
                      className={cn(
                        "rounded-md bg-card/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur-sm sm:text-[11px]",
                        promptCounterToneClass,
                      )}
                    >
                      {promptCharCount}/{PROMPT_INPUT_CONFIG.MAX_CHARS}
                    </button>
                  }
                />
                <TooltipPositioner side="top" align="end">
                  <TooltipContent
                    className={cn(
                      "max-w-56 px-2.5 py-1.5",
                      promptTooltipToneClass,
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
                          className={promptProgressTrackClass}
                          strokeWidth="2.5"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          className={promptProgressClass}
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          style={{
                            strokeDasharray: `${2 * Math.PI * 11}`,
                            strokeDashoffset: `${(2 * Math.PI * 11) * (1 - promptUsageRatio)}`,
                            transition: "stroke-dashoffset 200ms ease",
                          }}
                        />
                      </svg>
                      <p
                        className={cn(
                          "text-[11px] leading-tight",
                          promptTooltipTextToneClass,
                        )}
                      >
                        <span className="font-semibold">{promptCharsLeft}</span>{" "}
                        chars left. Short prompts are usually faster and more
                        reliable.
                      </p>
                    </div>
                  </TooltipContent>
                </TooltipPositioner>
              </Tooltip>
            </div>
            <Textarea
              data-edward-prompt-input="true"
              placeholder={hideSuggestions ? "Ask Edward anything..." : ""}
              value={inputValue}
              maxLength={PROMPT_INPUT_CONFIG.MAX_CHARS}
              onChange={(e) =>
                setInputValue(
                  e.target.value.slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS),
                )
              }
              disabled={isSubmissionBlocked}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
                  return;
                }
                e.preventDefault();
                if (isSubmitDisabled || isStreaming || submissionDisabledReason) return;
                handleProtectedAction();
              }}
              className="min-h-[4.5rem] sm:min-h-[5.5rem] md:min-h-[6.5rem] max-h-40 sm:max-h-52 md:max-h-64 overflow-y-auto resize-none border-0 bg-transparent p-3 pr-16 sm:p-4 sm:pr-20 md:p-6 md:pr-24 text-sm sm:text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10 font-medium leading-relaxed tracking-tight"
            />
          </div>

          <PromptToolbar
            isMobile={isMobile}
            isAuthenticated={isAuthenticated}
            supportsVision={supportsVision}
            canAttachMore={canAttachMore}
            attachedFiles={attachedFiles}
            fileInputRef={fileInputRef}
            onAttachmentClick={handleAttachmentClick}
            onFileInputChange={handleFileInputChange}
            onClearAllFiles={handleClearAllFiles}
            onProtectedAction={handleProtectedAction}
            isStreaming={isStreaming}
            onCancel={onCancel}
            disabled={isSubmitDisabled || Boolean(submissionDisabledReason)}
            disableAttachmentActions={areImageUploadsBlocked}
          />
        </div>
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSignIn={onSignIn}
        />
        {isAuthenticated && (
          <BYOK
            controller={{
              modal: {
                isOpen: showBYOK,
                onClose: () => setShowBYOK(false),
              },
              actions: {
                onValidate: () => {
                  if (submissionDisabledReason || isStreaming) return;
                  if (hasPendingUploads) return;
                  onProtectedAction?.(inputValue, uploadedImages);
                  setInputValue("");
                  handleClearAllFiles();
                  setShowBYOK(false);
                },
                onSaveApiKey,
              },
              state: {
                preferredModel,
                keyPreview,
                hasExistingKey: hasApiKey === true,
                error: apiKeyError,
                isRateLimited: isApiKeyRateLimited,
                rateLimitMessage: apiKeyRateLimitMessage,
              },
            }}
          />
        )}
      </Card>
      {submissionDisabledReason ? (
        <p className="mt-2 px-1 text-center text-[11px] font-medium text-amber-600/90 sm:px-2">
          {submissionDisabledReason}
        </p>
      ) : null}
    </div>
  );
}
