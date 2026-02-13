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
