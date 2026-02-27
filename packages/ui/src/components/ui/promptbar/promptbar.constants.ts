import type { Provider } from "@edward/shared/constants";

export const SUGGESTIONS: string[] = [
  "Build a high-fidelity SaaS landing page with Bento grid layouts and subtle motion reveals",
  "Create a complex multi-step onboarding flow with persistent state and Zod validation",
  "Implement a responsive dashboard with dynamic sidebar navigation and CSS Grid",
  "Design a dark-themed command palette with fuzzy search and keyboard shortcuts",
  "Develop a glassmorphic analytics dashboard using interactive charting and Tailwind CSS",
];

export const AttachmentUploadStatus = {
  UPLOADING: "uploading",
  UPLOADED: "uploaded",
  FAILED: "failed",
} as const;

export type AttachmentUploadStatus =
  (typeof AttachmentUploadStatus)[keyof typeof AttachmentUploadStatus];

export interface AttachedFile {
  id: string;
  file: File;
  preview: string;
  status: AttachmentUploadStatus;
  cdnUrl?: string;
  mimeType?: string;
  error?: string;
}

export function isUploading(file: AttachedFile): boolean {
  return file.status === AttachmentUploadStatus.UPLOADING;
}

export function isUploaded(file: AttachedFile): boolean {
  return file.status === AttachmentUploadStatus.UPLOADED;
}

export function isUploadFailed(file: AttachedFile): boolean {
  return file.status === AttachmentUploadStatus.FAILED;
}

export interface UploadedImageRef {
  url: string;
  mimeType: string;
  name: string;
  sizeBytes?: number;
}

export interface PromptbarAuthController {
  isAuthenticated?: boolean;
  onSignIn?: () => void | Promise<void>;
}

export interface PromptbarRef {
  prefill: (text: string) => void;
}

export interface PromptbarSubmissionController {
  onProtectedAction?: (
    text: string,
    images?: UploadedImageRef[],
  ) => void | Promise<void>;
  onEnhancePrompt?: (text: string) => string | Promise<string>;
  onTopContextVisibilityChange?: (visible: boolean) => void;
  hideSuggestions?: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
  submissionDisabledReason?: string;
}

export interface PromptbarAttachmentController {
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>;
  onImageUploadError?: (message: string) => void;
  disableImageUploads?: boolean;
  imageUploadDisabledReason?: string;
}

export interface PromptbarApiKeyController {
  hasApiKey?: boolean | null;
  isApiKeyLoading?: boolean;
  apiKeyError?: string;
  isApiKeyRateLimited?: boolean;
  apiKeyRateLimitMessage?: string;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  preferredModel?: string;
  keyPreview?: string | null;
  selectedModelId?: string;
}

export interface PromptbarController {
  auth?: PromptbarAuthController;
  submission?: PromptbarSubmissionController;
  attachments?: PromptbarAttachmentController;
  apiKey?: PromptbarApiKeyController;
}

export interface PromptbarLegacyProps {
  isAuthenticated?: boolean;
  onSignIn?: () => void | Promise<void>;
  onProtectedAction?: (
    text: string,
    images?: UploadedImageRef[],
  ) => void | Promise<void>;
  onEnhancePrompt?: (text: string) => string | Promise<string>;
  onTopContextVisibilityChange?: (visible: boolean) => void;
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>;
  onImageUploadError?: (message: string) => void;
  hasApiKey?: boolean | null;
  isApiKeyLoading?: boolean;
  apiKeyError?: string;
  isApiKeyRateLimited?: boolean;
  apiKeyRateLimitMessage?: string;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  preferredModel?: string;
  keyPreview?: string | null;
  selectedModelId?: string;
  hideSuggestions?: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
  submissionDisabledReason?: string;
  disableImageUploads?: boolean;
  imageUploadDisabledReason?: string;
}

export interface PromptbarControllerProps {
  controller: PromptbarController;
}

export type PromptbarProps = PromptbarLegacyProps | PromptbarControllerProps;
