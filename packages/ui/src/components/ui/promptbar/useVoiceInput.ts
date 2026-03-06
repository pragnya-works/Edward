import { useEffect, useRef, useState } from "react";
import { toast } from "@edward/ui/components/sonner";
import { PROMPT_INPUT_CONFIG } from "@edward/shared/constants";

interface SpeechRecognitionAlternativeLike {
    transcript: string;
}

interface SpeechRecognitionResultLike {
    isFinal: boolean;
    length: number;
    [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
    error?: string;
}

export interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: ((this: SpeechRecognitionInstance, event: Event) => void) | null;
    onend: ((this: SpeechRecognitionInstance, event: Event) => void) | null;
    onresult:
    | ((this: SpeechRecognitionInstance, event: SpeechRecognitionEventLike) => void)
    | null;
    onerror:
    | ((
        this: SpeechRecognitionInstance,
        event: SpeechRecognitionErrorEventLike,
    ) => void)
    | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

interface SpeechRecognitionConstructorLike {
    new(): SpeechRecognitionInstance;
}

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructorLike;
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}

const VOICE_SILENCE_TIMEOUT_MS = 5_000;

interface UseVoiceInputReturn {
    isVoiceSupported: boolean;
    isVoiceRecording: boolean;
    voiceRecognitionRef: React.RefObject<SpeechRecognitionInstance | null>;
    voiceBaseTextRef: React.RefObject<string>;
    voiceFinalTranscriptRef: React.RefObject<string>;
}

export function useVoiceInput(
    setInputValue: (value: string) => void,
): UseVoiceInputReturn {
    const [isVoiceSupported, setIsVoiceSupported] = useState(false);
    const [isVoiceRecording, setIsVoiceRecording] = useState(false);
    const voiceRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const voiceBaseTextRef = useRef("");
    const voiceFinalTranscriptRef = useRef("");
    const voiceSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const SpeechRecognitionConstructor =
            window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionConstructor) {
            setIsVoiceSupported(false);
            return;
        }

        const recognition = new SpeechRecognitionConstructor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang =
            typeof navigator !== "undefined" && navigator.language
                ? navigator.language
                : "en-US";

        const clearSilenceTimer = () => {
            if (voiceSilenceTimerRef.current !== null) {
                clearTimeout(voiceSilenceTimerRef.current);
                voiceSilenceTimerRef.current = null;
            }
        };

        const resetSilenceTimer = () => {
            clearSilenceTimer();
            voiceSilenceTimerRef.current = setTimeout(() => {
                recognition.stop();
            }, VOICE_SILENCE_TIMEOUT_MS);
        };

        recognition.onstart = () => {
            setIsVoiceRecording(true);
            resetSilenceTimer();
        };
        recognition.onend = () => {
            clearSilenceTimer();
            setIsVoiceRecording(false);
        };
        recognition.onerror = (event) => {
            clearSilenceTimer();
            setIsVoiceRecording(false);

            const code = event.error;
            if (!code || code === "aborted" || code === "no-speech") {
                return;
            }

            const messages: Record<string, string> = {
                "not-allowed": "Microphone access was denied. Allow microphone permission in your browser settings.",
                "audio-capture": "No microphone detected. Please connect a microphone and try again.",
                "network": "A network error occurred during voice recognition. Check your connection.",
                "service-not-allowed": "Voice recognition is not available on this page.",
                "language-not-supported": "Your browser does not support voice recognition in this language.",
            };

            toast.error("Voice input error", {
                description: messages[code] ?? `Voice recognition failed (${code}).`,
                id: "voice-error",
            });
        };
        recognition.onresult = (event) => {
            resetSilenceTimer();

            let interimChunk = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const result = event.results[index];
                if (!result) {
                    continue;
                }
                const transcript = result?.[0]?.transcript?.trim();
                if (!transcript) {
                    continue;
                }

                if (result.isFinal) {
                    voiceFinalTranscriptRef.current = [
                        voiceFinalTranscriptRef.current,
                        transcript,
                    ]
                        .filter(Boolean)
                        .join(" ");
                    continue;
                }

                interimChunk = [interimChunk, transcript].filter(Boolean).join(" ");
            }

            const combined = [
                voiceBaseTextRef.current,
                voiceFinalTranscriptRef.current,
                interimChunk,
            ]
                .filter(Boolean)
                .join(" ")
                .trim();

            if (combined.length >= PROMPT_INPUT_CONFIG.MAX_CHARS) {
                setInputValue(combined.slice(0, PROMPT_INPUT_CONFIG.MAX_CHARS));
                recognition.stop();
                toast.warning("Character limit reached", {
                    description: `Voice input stopped — prompt reached the ${PROMPT_INPUT_CONFIG.MAX_CHARS}-character limit.`,
                    id: "voice-char-limit",
                });
                return;
            }

            setInputValue(combined);
        };

        voiceRecognitionRef.current = recognition;
        setIsVoiceSupported(true);

        return () => {
            clearSilenceTimer();
            recognition.onstart = null;
            recognition.onend = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.abort();
            if (voiceRecognitionRef.current === recognition) {
                voiceRecognitionRef.current = null;
            }
        };
    }, [setInputValue]);

    return {
        isVoiceSupported,
        isVoiceRecording,
        voiceRecognitionRef,
        voiceBaseTextRef,
        voiceFinalTranscriptRef,
    };
}
