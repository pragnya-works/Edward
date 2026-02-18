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

export interface PromptbarProps {
  isAuthenticated?: boolean;
  onSignIn?: () => void | Promise<void>;
  onProtectedAction?: (
    text: string,
    images?: UploadedImageRef[],
  ) => void | Promise<void>;
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>;
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
  keyPreview?: string | null;
  selectedModelId?: string;
  hideSuggestions?: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
}
