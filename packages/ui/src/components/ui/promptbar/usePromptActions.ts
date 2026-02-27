import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "@edward/ui/components/sonner";
import { PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import type { SpeechRecognitionInstance } from "./useVoiceInput";
import type { UploadedImageRef } from "./promptbar.constants";

export const ENHANCE_PROMPT_MIN_CHARS = 30;

export function defaultEnhancePrompt(text: string): string {
    const normalized = text
        .trim()
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");

    if (!normalized) {
        return "";
    }

    const hasStructuredSections =
        /(^|\n)\s*(objective|goal|requirements|constraints|deliverables|output)\s*:/i.test(
            normalized,
        );
    if (hasStructuredSections) {
        return normalized;
    }

    const lines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const objective = lines[0] ?? normalized;
    const candidateRequirements = lines
        .slice(1)
        .join(" ")
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 6)
        .slice(0, 5);

    const requirements =
        candidateRequirements.length > 0
            ? candidateRequirements
            : [
                "Keep implementation production-ready and maintainable.",
                "Preserve existing behavior unless the task explicitly changes it.",
                "Optimize for responsiveness and low latency.",
            ];

    return [
        "Objective:",
        objective,
        "",
        "Requirements:",
        ...requirements.map((requirement) => `- ${requirement}`),
        "",
        "Output:",
        "- Brief implementation summary",
        "- Exact code changes",
        "- Validation checks and results",
    ].join("\n");
}

interface UsePromptActionsInput {
    inputValue: string;
    setInputValue: Dispatch<SetStateAction<string>>;
    uploadedImages: UploadedImageRef[];
    hasPendingUploads: boolean;
    canEnhancePrompt: boolean;
    isEnhancingPrompt: boolean;
    setIsEnhancingPrompt: Dispatch<SetStateAction<boolean>>;
    isAuthenticated: boolean;
    hasApiKey: boolean | null;
    isApiKeyLoading: boolean;
    isStreaming: boolean;
    isVoiceRecording: boolean;
    isSubmissionBlocked: boolean;
    submissionDisabledReason?: string;
    onProtectedAction?: (text: string, images?: UploadedImageRef[]) => void | Promise<void>;
    onEnhancePrompt?: (text: string) => string | Promise<string>;
    setShowLoginModal: Dispatch<SetStateAction<boolean>>;
    setShowBYOK: Dispatch<SetStateAction<boolean>>;
    handleClearAllFiles: () => void;
    voiceRecognitionRef: React.RefObject<SpeechRecognitionInstance | null>;
    voiceBaseTextRef: React.RefObject<string>;
    voiceFinalTranscriptRef: React.RefObject<string>;
}

export function usePromptActions({
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
}: UsePromptActionsInput) {
    const handleInputValueChange = useCallback((nextValue: string) => {
        setInputValue(nextValue.slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS));
    }, [setInputValue]);

    const handleProtectedAction = useCallback(async () => {
        if (submissionDisabledReason) return;
        if (hasPendingUploads) return;

        if (!isAuthenticated) {
            setShowLoginModal(true);
            return;
        }

        if (hasApiKey !== true) {
            if (!isApiKeyLoading) {
                setShowBYOK(true);
            }
            return;
        }

        try {
            await onProtectedAction?.(inputValue, uploadedImages);
            if (isVoiceRecording) {
                voiceRecognitionRef.current?.stop();
            }
            setInputValue("");
            handleClearAllFiles();
        } catch (error) {
            toast.error("Failed to submit prompt", {
                description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
                id: "protected-action-error",
            });
        }
    }, [
        hasApiKey,
        hasPendingUploads,
        inputValue,
        isApiKeyLoading,
        isAuthenticated,
        isVoiceRecording,
        onProtectedAction,
        submissionDisabledReason,
        uploadedImages,
        handleClearAllFiles,
        setInputValue,
        setShowLoginModal,
        setShowBYOK,
        voiceRecognitionRef,
    ]);

    const handleEnhancePrompt = useCallback(async () => {
        if (!canEnhancePrompt || isEnhancingPrompt) {
            return;
        }

        if (!isAuthenticated) {
            setShowLoginModal(true);
            return;
        }

        if (hasApiKey !== true) {
            if (!isApiKeyLoading) {
                setShowBYOK(true);
            }
            return;
        }

        const currentInput = inputValue.trim();
        setIsEnhancingPrompt(true);
        try {
            const enhancedText = await Promise.resolve(
                onEnhancePrompt?.(currentInput) ?? defaultEnhancePrompt(currentInput),
            );
            if (!enhancedText || !enhancedText.trim()) {
                return;
            }

            setInputValue(enhancedText.trim().slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS));
        } catch (error) {
            toast.error("Prompt enhancement failed", {
                description:
                    error instanceof Error ? error.message : "Something went wrong. Please try again.",
                id: "enhance-prompt-error",
            });
        } finally {
            setIsEnhancingPrompt(false);
        }
    }, [
        canEnhancePrompt,
        hasApiKey,
        inputValue,
        isApiKeyLoading,
        isAuthenticated,
        isEnhancingPrompt,
        onEnhancePrompt,
        setInputValue,
        setIsEnhancingPrompt,
        setShowBYOK,
        setShowLoginModal,
    ]);

    const handleToggleVoiceInput = useCallback(() => {
        const recognition = voiceRecognitionRef.current;
        if (!recognition || isSubmissionBlocked) {
            return;
        }

        if (isVoiceRecording) {
            recognition.stop();
            return;
        }

        voiceBaseTextRef.current = inputValue.trim();
        voiceFinalTranscriptRef.current = "";

        try {
            recognition.start();
        } catch {
            recognition.stop();
            toast.error("Could not start voice input", {
                description: "Failed to activate the microphone. Please try again.",
                id: "voice-start-error",
            });
        }
    }, [inputValue, isSubmissionBlocked, isVoiceRecording, voiceBaseTextRef, voiceFinalTranscriptRef, voiceRecognitionRef]);

    const handleByokValidate = useCallback(async () => {
        if (submissionDisabledReason || isStreaming) return;
        if (hasPendingUploads) return;

        try {
            await onProtectedAction?.(inputValue, uploadedImages);
            if (isVoiceRecording) {
                voiceRecognitionRef.current?.stop();
            }
            setInputValue("");
            handleClearAllFiles();
            setShowBYOK(false);
        } catch (error) {
            toast.error("Failed to submit prompt", {
                description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
                id: "byok-validate-error",
            });
        }
    }, [
        handleClearAllFiles,
        hasPendingUploads,
        inputValue,
        isStreaming,
        isVoiceRecording,
        onProtectedAction,
        submissionDisabledReason,
        uploadedImages,
        setInputValue,
        setShowBYOK,
        voiceRecognitionRef,
    ]);

    return {
        handleInputValueChange,
        handleProtectedAction,
        handleEnhancePrompt,
        handleToggleVoiceInput,
        handleByokValidate,
    };
}
