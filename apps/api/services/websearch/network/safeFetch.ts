import {
  cancelResponseBody as cancelResponseBodyInternal,
  fetchWithSafeRedirects as fetchWithSafeRedirectsInternal,
  readResponseBufferWithLimit as readResponseBufferWithLimitInternal,
  readResponseTextWithLimit as readResponseTextWithLimitInternal,
} from "../../network/safeFetch.js";

interface SafeFetchOptions {
  signal: AbortSignal;
  maxRedirects?: number;
  accept?: string;
  userAgent?: string;
  headers?: Record<string, string>;
  blockedHostnames?: ReadonlySet<string>;
  redirectStatuses?: ReadonlySet<number>;
}

export async function cancelResponseBody(response: Response): Promise<void> {
  return cancelResponseBodyInternal(response);
}

export async function fetchWithSafeRedirects(
  sourceUrl: string | URL,
  options: SafeFetchOptions,
): Promise<{ response: Response; finalUrl: URL }> {
  return fetchWithSafeRedirectsInternal(sourceUrl, options);
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  return readResponseTextWithLimitInternal(response, maxBytes);
}

export async function readResponseBufferWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  return readResponseBufferWithLimitInternal(response, maxBytes);
}
