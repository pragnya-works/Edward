import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import ChatPageClient from "@/components/chat/chatPageClient";
import { ChatRouteNotFoundState } from "@/components/chat/chatRouteNotFoundState";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_DEV_API_URL = "http://localhost:8000";
const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CHAT_ID_MIN_LENGTH = 20;
const CHAT_ID_MAX_LENGTH = 64;

function normalizeApiBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
}

function resolveApiBaseUrl(): string {
  const internalApiUrl = process.env.INTERNAL_API_URL?.trim();
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const configured = internalApiUrl || publicApiUrl;
  const normalized = configured ? normalizeApiBaseUrl(configured) : null;

  if (normalized) {
    return normalized;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INTERNAL_API_URL or NEXT_PUBLIC_API_URL must be a valid absolute http(s) URL in production.",
    );
  }

  return DEFAULT_DEV_API_URL;
}

const API_BASE_URL = resolveApiBaseUrl();

const DEFAULT_CHAT_METADATA: Metadata = {
  title: "Chat",
  description: "Continue your project conversation and iterate with Edward.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

interface ChatMetaResponse {
  data?: {
    chatId: string;
    title: string | null;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: string;
  };
}

interface ChatMetaFetchResult {
  status: number;
  ok: boolean;
  data: ChatMetaResponse["data"] | null;
  error: string | null;
}

interface ChatHistoryProbeData {
  chatId: string;
}

interface ChatHistoryProbeResult {
  status: number;
  ok: boolean;
  data: ChatHistoryProbeData | null;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isChatMetaData(value: unknown): value is NonNullable<ChatMetaResponse["data"]> {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return typeof record.chatId === "string";
}

function isChatHistoryProbeData(value: unknown): value is ChatHistoryProbeData {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return typeof record.chatId === "string";
}

function getApiErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  return asString(record?.error) ?? asString(record?.message);
}

function parseApiPayloadData(payload: unknown): unknown {
  const record = asRecord(payload);
  if (!record || !("data" in record)) {
    return null;
  }

  return (record as { data?: unknown }).data ?? null;
}

async function fetchApiPayload(url: string): Promise<{
  status: number;
  ok: boolean;
  payload: unknown;
  error: string | null;
}> {
  try {
    const incomingHeaders = await headers();
    const cookieHeader = incomingHeaders.get("cookie");

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: cookieHeader
        ? {
            cookie: cookieHeader,
          }
        : undefined,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      status: response.status,
      ok: response.ok,
      payload,
      error: getApiErrorMessage(payload),
    };
  } catch {
    return {
      status: 0,
      ok: false,
      payload: null,
      error: null,
    };
  }
}

async function fetchChatMeta(chatId: string): Promise<ChatMetaFetchResult> {
  const response = await fetchApiPayload(`${API_BASE_URL}/chat/${chatId}/meta`);
  const payloadData = parseApiPayloadData(response.payload);

  return {
    status: response.status,
    ok: response.ok,
    data: isChatMetaData(payloadData) ? payloadData : null,
    error: response.error,
  };
}

const fetchChatMetaCached = cache(fetchChatMeta);

async function probeChatHistory(chatId: string): Promise<ChatHistoryProbeResult> {
  const response = await fetchApiPayload(`${API_BASE_URL}/chat/${chatId}/history`);
  const payloadData = parseApiPayloadData(response.payload);

  return {
    status: response.status,
    ok: response.ok,
    data: isChatHistoryProbeData(payloadData) ? payloadData : null,
    error: response.error,
  };
}

function assertChatAccessStatus(params: {
  chatId: string;
  source: "metadata" | "history";
  status: number;
  ok: boolean;
  error: string | null;
}): void {
  const { chatId, source, status, ok, error } = params;

  if (status === 401 || status === 403 || status === 404) {
    notFound();
  }

  if (status === 0 || status >= 500) {
    throw new Error(`Failed to load chat ${chatId} ${source} (status ${status})`);
  }

  if (!ok) {
    const errorSuffix = error ? `: ${error}` : "";
    throw new Error(
      `Failed to load chat ${chatId} ${source} (status ${status})${errorSuffix}`,
    );
  }
}

export async function generateMetadata({
  params,
}: ChatPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isLikelyChatId(id)) {
    return DEFAULT_CHAT_METADATA;
  }

  const { data: meta } = await fetchChatMetaCached(id);
  if (!meta) {
    return DEFAULT_CHAT_METADATA;
  }

  const title = (meta.seoTitle || meta.title || "Chat").trim();
  const description = (
    meta.seoDescription ||
    meta.description ||
    "Continue your project conversation and iterate with Edward."
  ).trim();
  const canonicalPath = `/chat/${id}`;
  const canonicalUrl = getCanonicalUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
    openGraph: {
      url: canonicalUrl ?? undefined,
      title,
      description,
      images: [STATIC_OG_IMAGE_URL],
    },
    twitter: {
      title,
      description,
      images: [STATIC_OG_IMAGE_URL],
    },
  };
}

async function ensureChatIsAccessible(chatId: string): Promise<void> {
  const metaResult = await fetchChatMetaCached(chatId);
  assertChatAccessStatus({
    chatId,
    source: "metadata",
    status: metaResult.status,
    ok: metaResult.ok,
    error: metaResult.error,
  });

  if (metaResult.data) {
    return;
  }

  const historyResult = await probeChatHistory(chatId);
  assertChatAccessStatus({
    chatId,
    source: "history",
    status: historyResult.status,
    ok: historyResult.ok,
    error: historyResult.error,
  });
}

function isLikelyChatId(chatId: string): boolean {
  return (
    chatId.length >= CHAT_ID_MIN_LENGTH &&
    chatId.length <= CHAT_ID_MAX_LENGTH &&
    CHAT_ID_PATTERN.test(chatId)
  );
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  if (!isLikelyChatId(id)) {
    return <ChatRouteNotFoundState variant="invalid_id" />;
  }
  await ensureChatIsAccessible(id);
  return <ChatPageClient chatId={id} />;
}
