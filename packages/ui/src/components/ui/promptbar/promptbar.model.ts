import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { PROMPT_INPUT_CONFIG, UI_EVENTS } from "@edward/shared/constants";
import {
  SUGGESTIONS,
  type PromptbarApiKeyController,
  type PromptbarProps,
  type UploadedImageRef,
} from "./promptbar.constants";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const URL_SOURCE_PREVIEW_LIMIT = 6;
const PROMPT_INPUT_SELECTOR = "textarea[data-edward-prompt-input='true']";

export interface ResolvedPromptbarProps {
  isAuthenticated: boolean;
  onSignIn?: () => void | Promise<void>;
  onProtectedAction?: (
    text: string,
    images?: UploadedImageRef[],
  ) => void | Promise<void>;
  onEnhancePrompt?: (text: string) => string | Promise<string>;
  hasApiKey: boolean | null;
  isApiKeyLoading: boolean;
  apiKeyError: string;
  isApiKeyRateLimited: boolean;
  apiKeyRateLimitMessage: string;
  onSaveApiKey?: PromptbarApiKeyController["onSaveApiKey"];
  preferredModel?: string;
  keyPreview?: string | null;
  selectedModelId?: string;
  hideSuggestions: boolean;
  isStreaming: boolean;
  onCancel?: () => void;
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>;
  onImageUploadError?: (message: string) => void;
  submissionDisabledReason?: string;
  disableImageUploads: boolean;
  imageUploadDisabledReason?: string;
}

interface AttachmentStateInput {
  disableImageUploads: boolean;
  isSubmissionBlocked: boolean;
  imageUploadDisabledReason?: string;
  submissionDisabledReason?: string;
  isStreaming: boolean;
}

interface PromptMetricsInput {
  inputValue: string;
  uploadedImageCount: number;
  hasPendingUploads: boolean;
}

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

export function extractUrlsFromPrompt(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const candidate of matches) {
    const normalized = normalizeDetectedUrl(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls.slice(0, URL_SOURCE_PREVIEW_LIMIT);
}

export function resolvePromptbarProps(props: PromptbarProps): ResolvedPromptbarProps {
  if ("controller" in props) {
    const controller = props.controller;
    return {
      isAuthenticated: controller.auth?.isAuthenticated ?? false,
      onSignIn: controller.auth?.onSignIn,
      onProtectedAction: controller.submission?.onProtectedAction,
      onEnhancePrompt: controller.submission?.onEnhancePrompt,
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
      imageUploadDisabledReason: controller.attachments?.imageUploadDisabledReason,
    };
  }

  return {
    isAuthenticated: props.isAuthenticated ?? false,
    onSignIn: props.onSignIn,
    onProtectedAction: props.onProtectedAction,
    onEnhancePrompt: props.onEnhancePrompt,
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
    imageUploadDisabledReason: props.imageUploadDisabledReason,
  };
}

export function useAttachmentState({
  disableImageUploads,
  isSubmissionBlocked,
  imageUploadDisabledReason,
  submissionDisabledReason,
  isStreaming,
}: AttachmentStateInput) {
  const areImageUploadsBlocked = disableImageUploads || isSubmissionBlocked;
  const attachmentDisabledReason = useMemo(() => {
    if (!areImageUploadsBlocked) {
      return null;
    }

    if (disableImageUploads && imageUploadDisabledReason) {
      return imageUploadDisabledReason;
    }

    if (submissionDisabledReason) {
      return submissionDisabledReason;
    }

    if (isStreaming) {
      return "Stop generation before attaching new images.";
    }

    return "Image uploads are currently unavailable.";
  }, [
    areImageUploadsBlocked,
    disableImageUploads,
    imageUploadDisabledReason,
    submissionDisabledReason,
    isStreaming,
  ]);

  return {
    areImageUploadsBlocked,
    attachmentDisabledReason,
    promptHelperMessage:
      submissionDisabledReason ||
      (disableImageUploads ? attachmentDisabledReason : null),
  };
}

export function usePromptMetrics({
  inputValue,
  uploadedImageCount,
  hasPendingUploads,
}: PromptMetricsInput) {
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

  return {
    promptCharCount,
    promptUsageRatio,
    promptCharsLeft,
    isSubmitDisabled:
      (!inputValue.trim() && uploadedImageCount === 0) || hasPendingUploads,
    promptCounterToneClass: isPromptCharLimitReached
      ? "text-red-500/95"
      : isNearPromptCharLimit
        ? "text-muted-foreground"
        : "text-muted-foreground/75",
    promptTooltipToneClass: isPromptCharLimitReached
      ? "bg-red-500 text-white [&_[data-slot=tooltip-arrow]]:bg-red-500 [&_[data-slot=tooltip-arrow]]:fill-red-500"
      : isNearPromptCharLimit
        ? "bg-zinc-700 text-zinc-100 [&_[data-slot=tooltip-arrow]]:bg-zinc-700 [&_[data-slot=tooltip-arrow]]:fill-zinc-700"
        : "",
    promptTooltipTextToneClass: isPromptCharLimitReached
      ? "text-white/90"
      : isNearPromptCharLimit
        ? "text-zinc-100/90"
        : "text-primary-foreground/90",
    promptProgressTrackClass: isPromptCharLimitReached
      ? "stroke-white/35"
      : isNearPromptCharLimit
        ? "stroke-zinc-100/25"
        : "stroke-primary-foreground/25",
    promptProgressClass: isPromptCharLimitReached
      ? "stroke-white"
      : isNearPromptCharLimit
        ? "stroke-zinc-100"
        : "stroke-primary-foreground",
  };
}

export function useSuggestionRotation(
  setSuggestionIndex: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      interval = setInterval(() => {
        setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
      }, 4000);
    };

    const handleVisibilityChange = () => {
      if (interval) {
        clearInterval(interval);
      }
      if (!document.hidden) {
        startInterval();
      }
    };

    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [setSuggestionIndex]);
}

export function useInitialByokPrompt(
  isAuthenticated: boolean,
  hasApiKey: boolean | null,
  isApiKeyLoading: boolean,
  setShowBYOK: Dispatch<SetStateAction<boolean>>,
) {
  const initialLoadTriggered = useRef(false);

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
  }, [hasApiKey, isApiKeyLoading, isAuthenticated, setShowBYOK]);
}

export function usePromptbarGlobalEvents(
  isAuthenticated: boolean,
  isApiKeyLoading: boolean,
  setShowLoginModal: Dispatch<SetStateAction<boolean>>,
  setShowBYOK: Dispatch<SetStateAction<boolean>>,
) {
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
      if (!input) {
        return;
      }

      input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      input.focus();
    };

    window.addEventListener(UI_EVENTS.OPEN_API_KEY_MODAL, openApiKeyModal);
    window.addEventListener(UI_EVENTS.FOCUS_PROMPT_INPUT, focusPromptInput);

    return () => {
      window.removeEventListener(UI_EVENTS.OPEN_API_KEY_MODAL, openApiKeyModal);
      window.removeEventListener(UI_EVENTS.FOCUS_PROMPT_INPUT, focusPromptInput);
    };
  }, [isApiKeyLoading, isAuthenticated, setShowBYOK, setShowLoginModal]);
}
