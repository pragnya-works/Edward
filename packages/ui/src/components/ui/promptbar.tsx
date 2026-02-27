import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useIsMobile } from "@edward/ui/hooks/useMobile";
import { modelSupportsVision } from "@edward/shared/schema";
import { PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import {
  isUploaded,
  isUploading,
  type PromptbarProps,
  type UploadedImageRef,
  type PromptbarRef,
} from "./promptbar/promptbar.constants";
import { useFileAttachments } from "./promptbar/useFileAttachments";
import {
  extractUrlsFromPrompt,
  resolvePromptbarProps,
  useAttachmentState,
  useInitialByokPrompt,
  usePromptbarGlobalEvents,
  usePromptMetrics,
  useSuggestionRotation,
} from "./promptbar/promptbar.model";
import {
  PromptbarLayout,
  type PromptbarLayoutModel,
} from "./promptbar/promptbarLayout";
import { useVoiceInput } from "./promptbar/useVoiceInput";
import { ENHANCE_PROMPT_MIN_CHARS, usePromptActions } from "./promptbar/usePromptActions";

const Promptbar = forwardRef<PromptbarRef, PromptbarProps>((props, ref) => {
  const {
    isAuthenticated,
    onSignIn,
    onProtectedAction,
    onEnhancePrompt,
    onTopContextVisibilityChange,
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
    imageUploadDisabledReason,
  } = resolvePromptbarProps(props);

  const [inputValue, setInputValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [modalState, setModalState] = useState({
    showLoginModal: false,
    showBYOK: false,
  });
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const { showLoginModal, showBYOK } = modalState;
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const prefillTriggerRef = useRef({ text: "", trigger: 0 });

  useImperativeHandle(ref, () => ({
    prefill: (text: string) => {
      prefillTriggerRef.current = { text, trigger: Date.now() };
      setInputValue(text.slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS));
      queueMicrotask(() => {
        promptInputRef.current?.focus();
      });
    },
  }));

  const setShowLoginModal: Dispatch<SetStateAction<boolean>> = useCallback(
    (nextValue) => {
      setModalState((previous) => ({
        ...previous,
        showLoginModal:
          typeof nextValue === "function"
            ? nextValue(previous.showLoginModal)
            : nextValue,
      }));
    },
    [],
  );

  const setShowBYOK: Dispatch<SetStateAction<boolean>> = useCallback(
    (nextValue) => {
      setModalState((previous) => ({
        ...previous,
        showBYOK:
          typeof nextValue === "function"
            ? nextValue(previous.showBYOK)
            : nextValue,
      }));
    },
    [],
  );

  const isMobile = useIsMobile();
  const supportsVision = !selectedModelId || modelSupportsVision(selectedModelId);
  const isSubmissionBlocked = Boolean(submissionDisabledReason) || isStreaming;

  const { areImageUploadsBlocked, attachmentDisabledReason, promptHelperMessage } =
    useAttachmentState({
      disableImageUploads,
      isSubmissionBlocked,
      imageUploadDisabledReason,
      submissionDisabledReason,
      isStreaming,
    });

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
    handlePaste,
  } = useFileAttachments(
    isAuthenticated,
    supportsVision,
    areImageUploadsBlocked,
    attachmentDisabledReason,
    onImageUpload,
    onImageUploadError,
  );

  const uploadedImages = useMemo<UploadedImageRef[]>(
    () =>
      attachedFiles
        .filter((file) => isUploaded(file) && file.cdnUrl)
        .map((file) => ({
          url: file.cdnUrl!,
          mimeType: file.mimeType || file.file.type || "image/jpeg",
          name: file.file.name,
          sizeBytes: file.file.size,
        })),
    [attachedFiles],
  );

  const hasPendingUploads = attachedFiles.some((file) => isUploading(file));
  const trimmedInputLength = inputValue.trim().length;
  const canEnhancePrompt =
    !isSubmissionBlocked &&
    trimmedInputLength >= ENHANCE_PROMPT_MIN_CHARS &&
    inputValue.length < PROMPT_INPUT_CONFIG.MAX_CHARS;

  const {
    promptCharCount,
    promptUsageRatio,
    promptCharsLeft,
    isSubmitDisabled,
    promptCounterToneClass,
    promptTooltipToneClass,
    promptTooltipTextToneClass,
    promptProgressTrackClass,
    promptProgressClass,
  } = usePromptMetrics({ inputValue, uploadedImageCount: uploadedImages.length, hasPendingUploads });

  const detectedSourceUrls = useMemo(
    () => extractUrlsFromPrompt(inputValue),
    [inputValue],
  );
  const hasTopContext = detectedSourceUrls.length > 0;

  useEffect(() => {
    onTopContextVisibilityChange?.(hasTopContext);
  }, [hasTopContext, onTopContextVisibilityChange]);

  useEffect(
    () => () => {
      onTopContextVisibilityChange?.(false);
    },
    [onTopContextVisibilityChange],
  );

  useSuggestionRotation(setSuggestionIndex);
  useInitialByokPrompt(isAuthenticated, hasApiKey, isApiKeyLoading, setShowBYOK);
  usePromptbarGlobalEvents(isAuthenticated, isApiKeyLoading, setShowLoginModal, setShowBYOK, promptInputRef);

  const {
    isVoiceSupported,
    isVoiceRecording,
    voiceRecognitionRef,
    voiceBaseTextRef,
    voiceFinalTranscriptRef,
  } = useVoiceInput(setInputValue);

  useEffect(() => {
    if (!isSubmissionBlocked || !isVoiceRecording) return;
    voiceRecognitionRef.current?.stop();
  }, [isSubmissionBlocked, isVoiceRecording, voiceRecognitionRef]);

  const {
    handleInputValueChange,
    handleProtectedAction,
    handleEnhancePrompt,
    handleToggleVoiceInput,
    handleByokValidate,
  } = usePromptActions({
    inputValue,
    setInputValue,
    uploadedImages,
    hasPendingUploads,
    canEnhancePrompt,
    isEnhancingPrompt,
    setIsEnhancingPrompt,
    isAuthenticated,
    hasApiKey,
    isApiKeyLoading,
    isStreaming,
    isVoiceRecording,
    isSubmissionBlocked,
    submissionDisabledReason,
    onProtectedAction,
    onEnhancePrompt,
    setShowLoginModal,
    setShowBYOK,
    handleClearAllFiles,
    voiceRecognitionRef,
    voiceBaseTextRef,
    voiceFinalTranscriptRef,
  });

  const model: PromptbarLayoutModel = {
    auth: {
      isAuthenticated,
      onSignIn,
      hasApiKey,
      apiKeyError,
      isApiKeyRateLimited,
      apiKeyRateLimitMessage,
      preferredModel,
      keyPreview,
      onSaveApiKey,
    },
    view: {
      detectedSourceUrls,
      promptHelperMessage,
      hideSuggestions,
      suggestionIndex,
      inputValue,
      promptCharCount,
      promptCounterToneClass,
      promptTooltipToneClass,
      promptTooltipTextToneClass,
      promptProgressTrackClass,
      promptProgressClass,
      promptUsageRatio,
      promptCharsLeft,
      isSubmissionBlocked,
      isSubmitDisabled,
      isStreaming,
      supportsVision,
      isMobile,
      showLoginModal,
      showBYOK,
      isEnhancingPrompt,
      canEnhancePrompt,
      enhancePromptMinChars: ENHANCE_PROMPT_MIN_CHARS,
      isAtPromptLimit: inputValue.length >= PROMPT_INPUT_CONFIG.MAX_CHARS,
      isVoiceSupported,
      isVoiceRecording,
      disableAttachmentActions: areImageUploadsBlocked,
      attachmentDisabledReason,
      submissionDisabledReason,
    },
    files: {
      attachedFiles,
      isDragging,
      canAttachMore,
      fileInputRef,
      handleFileInputChange,
      handleClearAllFiles,
      handleRemoveFile,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleAttachmentClick,
      handlePaste,
    },
    actions: {
      onInputValueChange: handleInputValueChange,
      onProtectedAction: handleProtectedAction,
      onEnhancePrompt: handleEnhancePrompt,
      onToggleVoiceInput: handleToggleVoiceInput,
      onByokValidate: handleByokValidate,
      onShowLoginModalChange: setShowLoginModal,
      onShowBYOKChange: setShowBYOK,
      onCancel,
    },
    refs: {
      promptInputRef,
    },
  };

  return <PromptbarLayout model={model} />;
});

export default Promptbar;
