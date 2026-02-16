const DEFAULT_API_URL = "http://localhost:8000";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

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
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string };

export type MessageContent = string | MessageContentPart[];

export interface SendMessageRequest {
  content: MessageContent;
  chatId?: string;
  title?: string;
  model?: string;
}

function withDefaultHeaders(options: RequestInit): RequestInit {
  const hasFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;
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
  const response = await fetch(buildApiUrl(endpoint), withDefaultHeaders(options));
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

async function fileToContentPart(file: File): Promise<MessageContentPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve({
        type: "image",
        base64,
        mimeType: file.type || "image/jpeg",
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function filesToMessageContent(
  text: string,
  files: File[],
): Promise<MessageContent> {
  if (files.length === 0) return text;
  if (files.length === 1 && !text) {
    const fileContent = await fileToContentPart(files[0]!);
    return [fileContent];
  }

  const parts: MessageContentPart[] = [];

  if (text) {
    parts.push({ type: "text", text });
  }

  for (const file of files) {
    const fileContent = await fileToContentPart(file);
    parts.push(fileContent);
  }

  return parts;
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
