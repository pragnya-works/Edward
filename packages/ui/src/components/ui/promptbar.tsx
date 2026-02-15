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
  type PromptbarProps,
} from "./promptbar/promptbar.constants";
import { useFileAttachments } from "./promptbar/useFileAttachments";
import { DragDropOverlay } from "./promptbar/dragDropOverlay";
import { ImagePreviewStrip } from "./promptbar/imagePreviewStrip";
import { PromptToolbar } from "./promptbar/promptToolbar";

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
  } = useFileAttachments(isAuthenticated, supportsVision);

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
    if (!isAuthenticated) {
      setShowLoginModal(true);
    } else if (hasApiKey !== true) {
      if (!isApiKeyLoading) setShowBYOK(true);
    } else {
      onProtectedAction?.(
        inputValue,
        attachedFiles.map((f) => f.file),
      );
      setInputValue("");
      handleClearAllFiles();
    }
  }, [
    isAuthenticated,
    hasApiKey,
    isApiKeyLoading,
    onProtectedAction,
    attachedFiles,
    inputValue,
    handleClearAllFiles,
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
                  className="text-[15px] text-muted-foreground font-medium leading-relaxed tracking-tight p-6"
                  text={SUGGESTIONS[suggestionIndex]!}
                />
              </div>
            )}
          <Textarea
            placeholder={hideSuggestions ? "Ask Edward anything..." : ""}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="min-h-25 md:min-h-30 resize-none border-0 bg-transparent p-6 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10 font-medium leading-relaxed tracking-tight"
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
          disabled={!inputValue.trim() && attachedFiles.length === 0}
        />
      </div>
      {showLoginModal && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSignIn={onSignIn}
        />
      )}
      {showBYOK && isAuthenticated && (
        <BYOK
          isOpen={showBYOK}
          onClose={() => setShowBYOK(false)}
          onValidate={() => {
            onProtectedAction?.(
              inputValue,
              attachedFiles.map((f) => f.file),
            );
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
  );
}
