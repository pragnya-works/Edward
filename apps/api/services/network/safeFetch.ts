import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import {
  resolveSafeUrlTarget,
  type ResolvedUrlTarget,
} from "./safeFetch.network.js";

const DEFAULT_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
]);

const DEFAULT_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SafeFetchOptions {
  signal: AbortSignal;
  maxRedirects?: number;
  accept?: string;
  userAgent?: string;
  headers?: Record<string, string>;
  blockedHostnames?: ReadonlySet<string>;
  redirectStatuses?: ReadonlySet<number>;
}

async function fetchPinned(
  url: URL,
  target: ResolvedUrlTarget,
  options: SafeFetchOptions,
): Promise<Response> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: target.address,
        family: target.family,
        port: url.port ? Number.parseInt(url.port, 10) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        signal: options.signal,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        headers: {
          accept: options.accept ?? "*/*",
          "user-agent":
            options.userAgent ?? "EdwardBot/1.0 (+https://www.pragnyaa.in)",
          "accept-encoding": "identity",
          host: url.host,
          ...(options.headers ?? {}),
        },
      },
      (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(name, item);
            }
            continue;
          }
          headers.set(name, value);
        }

        resolve(
          new Response(
            incoming
              ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
              : null,
            {
              status: incoming.statusCode ?? 500,
              statusText: incoming.statusMessage ?? "",
              headers,
            },
          ),
        );
      },
    );

    request.once("error", reject);
    request.end();
  });
}

export async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Best effort only.
  }
}

export async function fetchWithSafeRedirects(
  sourceUrl: string | URL,
  options: SafeFetchOptions,
): Promise<{ response: Response; finalUrl: URL }> {
  const blockedHostnames =
    options.blockedHostnames ?? DEFAULT_BLOCKED_HOSTNAMES;
  const redirectStatuses =
    options.redirectStatuses ?? DEFAULT_REDIRECT_STATUSES;
  const maxRedirects = options.maxRedirects ?? 4;

  let current =
    typeof sourceUrl === "string"
      ? new URL(sourceUrl)
      : new URL(sourceUrl.toString());

  for (let attempt = 0; attempt <= maxRedirects; attempt++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error(`Unsupported URL protocol: ${current.protocol}`);
    }

    const resolvedTarget = await resolveSafeUrlTarget(current, blockedHostnames);
    const response = await fetchPinned(current, resolvedTarget, options);

    if (!redirectStatuses.has(response.status)) {
      return {
        response,
        finalUrl: current,
      };
    }

    const nextLocation = response.headers.get("location");
    await cancelResponseBody(response);

    if (!nextLocation) {
      throw new Error("Redirect response missing location header");
    }

    current = new URL(nextLocation, current);
  }

  throw new Error("Too many redirects while fetching URL");
}

export async function readResponseTextWithLimit(
  response: Response,
  limitBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > limitBytes) {
      throw new Error("Response body exceeds size limit");
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > limitBytes) {
      await reader.cancel();
      throw new Error("Response body exceeds size limit");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function readResponseBufferWithLimit(
  response: Response,
  limitBytes: number,
  limitError?: Error,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > limitBytes) {
      throw limitError ?? new Error("Response body exceeds size limit");
    }
    return Buffer.from(arrayBuffer);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > limitBytes) {
      await reader.cancel();
      throw limitError ?? new Error("Response body exceeds size limit");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes);
}
