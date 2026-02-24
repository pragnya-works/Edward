import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";

export type ResolvedUrlTarget = {
  address: string;
  family: 4 | 6;
};

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

function isBlockedHostname(
  hostname: string,
  blockedHostnames: ReadonlySet<string>,
): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (blockedHostnames.has(normalized)) return true;

  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some(
      (value) => Number.isNaN(value) || value < 0 || value > 255,
    )
  ) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function getMappedIPv4Address(address: string): string | null {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }

  const mapped = normalized.slice("::ffff:".length);
  if (!mapped) {
    return null;
  }

  if (net.isIP(mapped) === 4) {
    return mapped;
  }

  const parts = mapped.split(":");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }

  const high = Number.parseInt(parts[0] ?? "", 16);
  const low = Number.parseInt(parts[1] ?? "", 16);
  if (Number.isNaN(high) || Number.isNaN(low)) {
    return null;
  }

  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const mappedIPv4 = getMappedIPv4Address(normalized);
  if (mappedIPv4) {
    return isPrivateIPv4(mappedIPv4);
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIPv4(address);
  if (ipVersion === 6) return isPrivateIPv6(address);
  return false;
}

function normalizeHostnameForIpChecks(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

async function resolveSafeUrlTarget(
  url: URL,
  blockedHostnames: ReadonlySet<string>,
): Promise<ResolvedUrlTarget> {
  const hostname = normalizeHostnameForIpChecks(url.hostname);
  if (isBlockedHostname(hostname, blockedHostnames)) {
    throw new Error(`URL host is not allowed: ${hostname}`);
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Private IP targets are not allowed: ${hostname}`);
    }
    return {
      address: hostname,
      family: ipVersion as 4 | 6,
    };
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`Resolved private IP is not allowed: ${entry.address}`);
    }
  }

  const selected = resolved[0];
  if (!selected) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
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
