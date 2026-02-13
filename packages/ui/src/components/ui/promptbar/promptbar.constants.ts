import { Provider } from "@edward/shared/constants";

export const SUGGESTIONS: string[] = [
    "Build a high-fidelity SaaS landing page with Bento grid layouts and subtle motion reveals",
    "Create a complex multi-step onboarding flow with persistent state and Zod validation",
    "Implement a responsive dashboard with dynamic sidebar navigation and CSS Grid",
    "Design a dark-themed command palette with fuzzy search and keyboard shortcuts",
    "Develop a glassmorphic analytics dashboard using interactive charting and Tailwind CSS",
];

export const ACCEPTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export interface AttachedFile {
    id: string;
    file: File;
    preview: string;
}

export interface PromptbarProps {
    isAuthenticated?: boolean;
    onSignIn?: () => void | Promise<void>;
    onProtectedAction?: (files?: File[]) => void | Promise<void>;
    hasApiKey?: boolean | null;
    isApiKeyLoading?: boolean;
    apiKeyError?: string;
    onSaveApiKey?: (
        apiKey: string,
        onValidate: (key: string) => void,
        onClose: () => void,
        provider: Provider,
        model?: string,
    ) => Promise<boolean>;
    preferredModel?: string;
    selectedModelId?: string;
}
