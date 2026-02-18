import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { z } from "zod";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

export type AllowedImageMimeType =
  (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

export interface ValidatedImage {
  base64: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  sourceUrl?: string;
}

export interface ImageValidationError {
  field: string;
  message: string;
}

type ResolvedUrlTarget = {
  address: string;
  family: 4 | 6;
};

const MAX_BASE64_LENGTH =
  Math.ceil((IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES * 4) / 3) + 100;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
]);

export interface ValidatedImage {
  base64: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  sourceUrl?: string;
}

export interface ImageValidationError {
  field: string;
  message: string;
}

const MIME_SIGNATURES: Record<AllowedImageMimeType, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

function createImageSizeLimitError(): Error {
  const error = new Error(
    `Image size exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
  );
  error.name = "ImageSizeLimitError";
  return error;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
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

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isPrivateIPv4(mapped);
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIPv4(address);
  if (ipVersion === 6) return isPrivateIPv6(address);
  return false;
}

async function resolveSafeUrlTarget(url: URL): Promise<ResolvedUrlTarget> {
  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
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
  signal: AbortSignal,
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
        signal,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        headers: {
          accept: "image/*",
          "user-agent": "EdwardBot/1.0 (+https://www.pragnyaa.in)",
          "accept-encoding": "identity",
          host: url.host,
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

async function fetchWithSafeRedirects(
  sourceUrl: URL,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = new URL(sourceUrl.toString());

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const resolvedTarget = await resolveSafeUrlTarget(current);
    const response = await fetchPinned(current, resolvedTarget, signal);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return {
        response,
        finalUrl: current,
      };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect response missing location header");
    }
    current = new URL(location, current);
  }

  throw new Error("Too many redirects while fetching image URL");
}

async function readResponseBufferWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw createImageSizeLimitError();
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
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw createImageSizeLimitError();
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes);
}

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str);
}

function detectMimeTypeFromBuffer(buffer: Buffer): AllowedImageMimeType | null {
  for (const [mimeType, signature] of Object.entries(MIME_SIGNATURES)) {
    if (buffer.length >= signature.length) {
      const slice = buffer.subarray(0, signature.length);
      if (slice.equals(signature)) {
        if (mimeType === "image/webp" && buffer.length >= 12) {
          const webpSignature = buffer.subarray(8, 12);
          if (!webpSignature.equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) {
            continue;
          }
        }
        return mimeType as AllowedImageMimeType;
      }
    }
  }
  return null;
}

function ensureMimeMatch(
  detectedMimeType: AllowedImageMimeType,
  declaredMimeType?: string,
): ImageValidationError | null {
  if (!declaredMimeType) return null;
  if (declaredMimeType === detectedMimeType) return null;
  return {
    field: "mimeType",
    message: `Declared MIME type (${declaredMimeType}) does not match detected format (${detectedMimeType})`,
  };
}

export function validateImageBuffer(
  buffer: Buffer,
  declaredMimeType?: string,
):
  | { success: true; data: Omit<ValidatedImage, "sourceUrl"> }
  | { success: false; error: ImageValidationError } {
  if (!buffer || buffer.length === 0) {
    return {
      success: false,
      error: { field: "buffer", message: "Image data is required" },
    };
  }

  const sizeBytes = buffer.byteLength;
  if (sizeBytes > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
    return {
      success: false,
      error: {
        field: "buffer",
        message: `Image size (${(sizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
      },
    };
  }

  const detectedMimeType = detectMimeTypeFromBuffer(buffer);
  if (!detectedMimeType) {
    return {
      success: false,
      error: {
        field: "mimeType",
        message:
          "Could not detect image format. Only JPEG, PNG, and WebP are supported.",
      },
    };
  }

  const mimeError = ensureMimeMatch(detectedMimeType, declaredMimeType);
  if (mimeError) {
    return { success: false, error: mimeError };
  }

  return {
    success: true,
    data: {
      base64: buffer.toString("base64"),
      mimeType: detectedMimeType,
      sizeBytes,
    },
  };
}

export function validateBase64Image(
  base64: string,
  declaredMimeType?: string,
):
  | { success: true; data: Omit<ValidatedImage, "sourceUrl"> }
  | { success: false; error: ImageValidationError } {
  if (!base64 || typeof base64 !== "string") {
    return {
      success: false,
      error: { field: "base64", message: "Image data is required" },
    };
  }

  if (!isValidBase64(base64)) {
    return {
      success: false,
      error: { field: "base64", message: "Invalid base64 encoding" },
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return {
      success: false,
      error: { field: "base64", message: "Failed to decode base64 data" },
    };
  }

  const validated = validateImageBuffer(buffer, declaredMimeType);
  if (!validated.success) return validated;
  return { success: true, data: validated.data };
}

export async function validateImageUrl(
  url: string,
  declaredMimeType?: string,
): Promise<
  | { success: true; data: ValidatedImage }
  | { success: false; error: ImageValidationError }
> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      success: false,
      error: { field: "url", message: "Invalid image URL" },
    };
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: {
        field: "url",
        message: "Only HTTP/HTTPS image URLs are allowed",
      },
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    IMAGE_FETCH_TIMEOUT_MS,
  );

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(
      parsedUrl,
      abortController.signal,
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: {
          field: "url",
          message: `Failed to fetch image: HTTP ${response.status}`,
        },
      };
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isNaN(contentLength) &&
        contentLength > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES
      ) {
        return {
          success: false,
          error: {
            field: "url",
            message: `Image size (${(contentLength / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
          },
        };
      }
    }

    const buffer = await readResponseBufferWithLimit(
      response,
      IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES,
    );
    const validated = validateImageBuffer(buffer, declaredMimeType);
    if (!validated.success) {
      return validated;
    }

    return {
      success: true,
      data: {
        ...validated.data,
        sourceUrl: finalUrl.toString(),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ImageSizeLimitError") {
      return {
        success: false,
        error: {
          field: "url",
          message: `Image size exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
        },
      };
    }
    return {
      success: false,
      error: { field: "url", message: "Failed to fetch image from URL" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateImageCount(
  images: unknown[],
): ImageValidationError | null {
  if (images.length > IMAGE_UPLOAD_CONFIG.MAX_FILES) {
    return {
      field: "images",
      message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message, received ${images.length}`,
    };
  }
  return null;
}

export const ImageContentBase64Schema = z.object({
  type: z.literal("image"),
  base64: z
    .string()
    .max(
      MAX_BASE64_LENGTH,
      `Image too large. Maximum size is ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB`,
    ),
  mimeType: z.enum(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES),
});

const ImageContentUrlSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
  mimeType: z.enum(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).optional(),
});

const ImageContentSchema = z.union([
  ImageContentBase64Schema,
  ImageContentUrlSchema,
]);

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "Text content cannot be empty"),
});

export const MessageContentPartSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
]);

export const MultimodalContentSchema = z
  .array(MessageContentPartSchema)
  .max(
    IMAGE_UPLOAD_CONFIG.MAX_FILES + 1,
    `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES + 1} content parts allowed`,
  )
  .refine(
    (parts) =>
      parts.filter(
        (p): p is z.infer<typeof ImageContentSchema> => p.type === "image",
      ).length <= IMAGE_UPLOAD_CONFIG.MAX_FILES,
    {
      message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message`,
    },
  )
  .refine(
    (parts) =>
      parts.some((p) => p.type === "text" && p.text.trim().length > 0) ||
      parts.some((p) => p.type === "image"),
    { message: "Message must contain text or at least one image" },
  );
