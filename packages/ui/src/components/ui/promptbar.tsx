import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card } from "@edward/ui/components/card";
import { Textarea } from "@edward/ui/components/textarea";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import { useIsMobile } from "@edward/ui/hooks/useMobile";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { BYOK } from "@edward/ui/components/ui/byok";
import { modelSupportsVision } from "@edward/shared/schema";
import { cn } from "@edward/ui/lib/utils";
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

export default function Promptbar({
  isAuthenticated = false,
  onSignIn,
  onProtectedAction,
  hasApiKey = null,
  isApiKeyLoading = false,
  apiKeyError = "",
  onSaveApiKey,
  preferredModel,
  keyPreview,
  selectedModelId,
  hideSuggestions = false,
  isStreaming = false,
  onCancel,
  onImageUpload,
}: PromptbarProps) {
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
  } = useFileAttachments(isAuthenticated, supportsVision, onImageUpload);

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
            <Textarea
              placeholder={hideSuggestions ? "Ask Edward anything..." : ""}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
                  return;
                }
                e.preventDefault();
                if (isSubmitDisabled || isStreaming) return;
                handleProtectedAction();
              }}
              className="min-h-[4.5rem] sm:min-h-[5.5rem] md:min-h-[6.5rem] max-h-40 sm:max-h-52 md:max-h-64 overflow-y-auto resize-none border-0 bg-transparent p-3 sm:p-4 md:p-6 text-sm sm:text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10 font-medium leading-relaxed tracking-tight"
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
            disabled={isSubmitDisabled}
          />
        </div>
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSignIn={onSignIn}
        />
        {isAuthenticated && (
          <BYOK
            isOpen={showBYOK}
            onClose={() => setShowBYOK(false)}
            onValidate={() => {
              if (hasPendingUploads) return;
              onProtectedAction?.(inputValue, uploadedImages);
              setInputValue("");
              handleClearAllFiles();
              setShowBYOK(false);
            }}
            onSaveApiKey={onSaveApiKey}
            preferredModel={preferredModel}
            keyPreview={keyPreview}
            hasExistingKey={hasApiKey === true}
            error={apiKeyError}
          />
        )}
      </Card>
    </div>
  );
}
