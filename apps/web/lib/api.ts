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

interface SendMessageResponse {
  success: boolean;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.error || errorData.message || `API Error: ${response.status}`,
    ) as ApiError;
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json() as Promise<T>;
}

export async function sendMessage(
  body: SendMessageRequest,
): Promise<SendMessageResponse> {
  return fetchApi<SendMessageResponse>("/api/chat/message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fileToContentPart(
  file: File,
): Promise<MessageContentPart> {
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
