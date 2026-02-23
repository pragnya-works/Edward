export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

const DEFAULT_API_URL = "http://localhost:8000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const TYPEOF_UNDEFINED = "undefined";

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    `NEXT_PUBLIC_API_URL is not defined, using default: ${DEFAULT_API_URL}. ` +
      "Please set NEXT_PUBLIC_API_URL in your environment variables for production.",
  );
}

export function buildApiUrl(endpoint: string): string {
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
