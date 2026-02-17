import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

const DEFAULT_API_URL = "http://localhost:8000";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const TYPEOF_UNDEFINED = "undefined";

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    `NEXT_PUBLIC_API_URL is not defined, using default: ${DEFAULT_API_URL}. ` +
      "Please set NEXT_PUBLIC_API_URL in your environment variables for production.",
  );
}

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

export enum MessageContentPartType {
  TEXT = "text",
  IMAGE = "image",
}

function buildApiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const errorData = await response.json().catch(() => ({}));
  const error = new Error(
    (errorData as { error?: string; message?: string }).error ||
      (errorData as { error?: string; message?: string }).message ||
      `API Error: ${response.status}`,
  ) as ApiError;
  error.status = response.status;
  error.data = errorData;
  return error;
}

export type MessageContentPart =
  | { type: MessageContentPartType.TEXT; text: string }
  | { type: MessageContentPartType.IMAGE; url: string; mimeType?: string };

export type MessageContent = string | MessageContentPart[];

export interface SendMessageRequest {
  content: MessageContent;
  chatId?: string;
  title?: string;
  model?: string;
}

function withDefaultHeaders(options: RequestInit): RequestInit {
  const hasFormDataBody =
    typeof FormData !== TYPEOF_UNDEFINED && options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!hasFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return {
    ...options,
    headers,
    credentials: "include",
  };
}

export async function fetchApiResponse(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(
    buildApiUrl(endpoint),
    withDefaultHeaders(options),
  );
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetchApiResponse(endpoint, options);
  return response.json() as Promise<T>;
}

export async function postChatMessageStream(
  body: SendMessageRequest,
  signal?: AbortSignal,
): Promise<Response> {
  return fetchApiResponse("/chat/message", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export type UploadableImageMimeType =
  (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

export interface UploadedImage {
  url: string;
  mimeType: string;
  name?: string;
  sizeBytes?: number;
}

function normalizeImageMimeType(
  mimeType?: string,
): UploadableImageMimeType | undefined {
  if (!mimeType) return undefined;
  if (
    IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(
      mimeType as UploadableImageMimeType,
    )
  ) {
    return mimeType as UploadableImageMimeType;
  }
  console.warn(`Image type ${mimeType} not supported. Sending URL without mime.`);
  return undefined;
}

function validateFile(file: File): { valid: boolean; error?: string } {
  if (
    !IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(
      file.type as (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number],
    )
  ) {
    return {
      valid: false,
      error: `File type ${file.type} not supported. Use JPEG, PNG, or WebP.`,
    };
  }
  if (file.size > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File ${file.name} exceeds ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB limit.`,
    };
  }
  return { valid: true };
}

export async function filesToMessageContent(
  text: string,
  images: UploadedImage[],
): Promise<MessageContent> {
  const uploadedImages = images
    .slice(0, IMAGE_UPLOAD_CONFIG.MAX_FILES)
    .map((image) => ({
      ...image,
      url: image.url?.trim(),
      mimeType: normalizeImageMimeType(image.mimeType),
    }))
    .filter((image) => Boolean(image.url));

  if (uploadedImages.length === 0) return text;

  if (uploadedImages.length === 1 && !text) {
    return [
      {
        type: MessageContentPartType.IMAGE,
        url: uploadedImages[0]!.url,
        mimeType: uploadedImages[0]!.mimeType,
      },
    ];
  }

  const parts: MessageContentPart[] = [];

  if (text) {
    parts.push({ type: MessageContentPartType.TEXT, text });
  }

  parts.push(
    ...uploadedImages.map((image) => ({
      type: MessageContentPartType.IMAGE as const,
      url: image.url,
      mimeType: image.mimeType,
    })),
  );

  return parts;
}

interface UploadImageResponse {
  message: string;
  data: {
    url: string;
    key: string;
    mimeType: UploadableImageMimeType;
    sizeBytes: number;
  };
  timestamp: string;
}

export async function uploadImageToCdn(file: File): Promise<UploadedImage> {
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid file");
  }

  const response = await fetch(buildApiUrl("/chat/image-upload"), {
    method: "POST",
    body: file,
    credentials: "include",
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "x-file-name": encodeURIComponent(file.name),
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const result = (await response.json()) as UploadImageResponse;
  return {
    url: result.data.url,
    mimeType: result.data.mimeType,
    name: file.name,
    sizeBytes: result.data.sizeBytes,
  };
}

export interface BuildError {
  id: string;
  headline: string;
  type: string;
  severity: "critical" | "error" | "warning";
  stage: string;
  confidence: number;
  error: {
    file: string;
    line: number;
    column?: number;
    message: string;
    code?: string;
    snippet: string;
    fullContent?: string;
    target?: string;
    stackTrace?: string[];
  };
  context: {
    packageJson?: Record<string, unknown>;
    tsConfig?: Record<string, unknown>;
    importChain?: Array<{ file: string; line: number; importPath: string }>;
    recentChanges?: string[];
  };
  relatedErrors: string[];
  relatedFiles: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  suggestion?: string;
  timestamp: string;
}

export interface BuildErrorReport {
  failed: true;
  headline: string;
  summary: {
    totalErrors: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    uniqueTypes: string[];
    stage: string;
  };
  errors: BuildError[];
  rootCause?: BuildError;
  framework?: string;
  command: string;
  rawOutput: string;
  processedAt: string;
  duration: number;
}

export enum BuildRecordStatus {
  QUEUED = "queued",
  BUILDING = "building",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface BuildStatusResponse {
  message: string;
  data: {
    chatId: string;
    build: {
      id: string;
      status: BuildRecordStatus;
      previewUrl: string | null;
      buildDuration: number | null;
      errorReport: BuildErrorReport | null;
      createdAt: string;
    } | null;
  };
}

export async function getBuildStatus(
  chatId: string,
): Promise<BuildStatusResponse> {
  return fetchApi<BuildStatusResponse>(`/chat/${chatId}/build-status`);
}

export interface SandboxFile {
  path: string;
  content: string;
  isComplete: boolean;
}

export interface SandboxFilesResponse {
  message: string;
  data: {
    chatId: string;
    sandboxId: string;
    files: SandboxFile[];
    totalFiles: number;
  };
}

export async function getSandboxFiles(
  chatId: string,
): Promise<SandboxFilesResponse> {
  return fetchApi<SandboxFilesResponse>(`/chat/${chatId}/sandbox-files`);
}
