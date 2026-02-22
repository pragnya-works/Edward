import { createHash } from "node:crypto";
import {
  adjectives,
  animals,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { buildS3Key } from "./storage/key.utils.js";
import { and, db, chat, eq, isNull } from "@edward/auth";

const logger = createLogger("PREVIEW_ROUTING");

export const SUBDOMAIN_RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "dashboard",
  "ftp",
  "dev",
  "smtp",
  "staging",
  "preview",
  "static",
  "assets",
  "cdn",
  "media",
  "files",
  "storage",
]);

const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

const KV_FETCH_TIMEOUT_MS = 10000;
const SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS = 5;

export interface SubdomainValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateSubdomainFormat(
  subdomain: string,
): SubdomainValidationResult {
  if (!subdomain || subdomain.length < 3) {
    return { valid: false, reason: "Subdomain must be at least 3 characters." };
  }
  if (subdomain.length > 63) {
    return {
      valid: false,
      reason: "Subdomain must be 63 characters or fewer.",
    };
  }
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return {
      valid: false,
      reason:
        "Only lowercase letters, numbers, and hyphens are allowed. Cannot start or end with a hyphen.",
    };
  }
  if (SUBDOMAIN_RESERVED.has(subdomain)) {
    return { valid: false, reason: `"${subdomain}" is a reserved word.` };
  }
  return { valid: true };
}

export interface SubdomainAvailabilityResult {
  available: boolean;
  reason?: string;
}

function getChatStoragePrefix(userId: string, chatId: string): string {
  return buildS3Key(userId, chatId).replace(/\/$/, "");
}

function getKvEndpoint(subdomain: string, routingConfig: PreviewRoutingConfig): string {
  return (
    `https://api.cloudflare.com/client/v4/accounts/${routingConfig.accountId}` +
    `/storage/kv/namespaces/${routingConfig.namespaceId}/values/${subdomain}`
  );
}

async function readKvEntry(
  subdomain: string,
  routingConfig: PreviewRoutingConfig,
): Promise<string | null> {
  const endpoint = getKvEndpoint(subdomain, routingConfig);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KV_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${routingConfig.apiToken}`,
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Cloudflare KV read failed (${response.status} ${response.statusText}): ${details.slice(0, 500)}`,
      );
    }

    return await response.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Cloudflare KV read timed out after ${KV_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkSubdomainAvailability(
  subdomain: string,
  chatId: string,
  expectedStoragePrefix?: string,
): Promise<SubdomainAvailabilityResult> {
  const formatCheck = validateSubdomainFormat(subdomain);
  if (!formatCheck.valid) {
    return { available: false, reason: formatCheck.reason };
  }

  const existing = await db
    .select({ id: chat.id })
    .from(chat)
    .where(eq(chat.customSubdomain, subdomain))
    .limit(1);

  if (existing.length > 0 && existing[0]!.id !== chatId) {
    return { available: false, reason: "This subdomain is already taken." };
  }

  const routingConfig = getPreviewRoutingConfig();
  if (!routingConfig) {
    return { available: true };
  }

  let callerStoragePrefix = expectedStoragePrefix;
  if (!callerStoragePrefix) {
    const [chatData] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);
    if (!chatData) {
      return { available: false, reason: "Chat not found." };
    }
    callerStoragePrefix = getChatStoragePrefix(chatData.userId, chatId);
  }

  const kvValue = await readKvEntry(subdomain, routingConfig);
  if (kvValue !== null && kvValue !== callerStoragePrefix) {
    return { available: false, reason: "This subdomain is already taken." };
  }

  return { available: true };
}

interface PreviewRoutingConfig {
  apiToken: string;
  accountId: string;
  namespaceId: string;
  rootDomain: string;
}

export interface PreviewRoutingResult {
  subdomain: string;
  previewUrl: string;
  storagePrefix: string;
}

function normalizeRootDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function getPreviewRoutingConfig(): PreviewRoutingConfig | null {
  const apiToken = config.previewRouting.cloudflareApiToken?.trim();
  const accountId = config.previewRouting.cloudflareAccountId?.trim();
  const namespaceId = config.previewRouting.cloudflareKvNamespaceId?.trim();
  const rootDomain = config.previewRouting.rootDomain?.trim();

  if (!apiToken || !accountId || !namespaceId || !rootDomain) {
    return null;
  }

  return {
    apiToken,
    accountId,
    namespaceId,
    rootDomain: normalizeRootDomain(rootDomain),
  };
}

export function isPreviewRoutingConfigured(): boolean {
  return getPreviewRoutingConfig() !== null;
}

export function generatePreviewSubdomain(
  userId: string,
  chatId: string,
  attempt = 0,
): string {
  const digestSource =
    attempt === 0 ? `${userId}:${chatId}` : `${userId}:${chatId}:${attempt}`;
  const digest = createHash("sha256")
    .update(digestSource)
    .digest("hex")
    .toLowerCase();

  const seed = parseInt(digest.slice(0, 8), 16);
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "-",
    style: "lowerCase",
    length: 2,
    seed,
  }).replace(/[^a-z0-9-]/g, "-");

  const uniqueSuffix = parseInt(digest.slice(16, 24), 16)
    .toString(36)
    .slice(0, 5)
    .padStart(5, "0");

  return `${name}-${uniqueSuffix}`;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function resolveSubdomainForRouting(
  userId: string,
  chatId: string,
  customSubdomain?: string | null,
): Promise<string> {
  const providedSubdomain = customSubdomain?.trim();
  if (providedSubdomain) {
    return providedSubdomain;
  }

  for (let attempt = 0; attempt < SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generatePreviewSubdomain(userId, chatId, attempt);
    try {
      const claimed = await db
        .update(chat)
        .set({ customSubdomain: candidate, updatedAt: new Date() })
        .where(and(eq(chat.id, chatId), isNull(chat.customSubdomain)))
        .returning({ customSubdomain: chat.customSubdomain });

      if (claimed.length > 0) {
        return claimed[0]!.customSubdomain ?? candidate;
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        logger.warn(
          { chatId, candidate, attempt },
          "Generated preview subdomain collided with an existing record; retrying",
        );
        continue;
      }
      throw error;
    }

    const [existing] = await db
      .select({ customSubdomain: chat.customSubdomain })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (existing?.customSubdomain) {
      return existing.customSubdomain;
    }
  }

  throw new Error(
    `Unable to assign a unique preview subdomain after ${SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS} attempts`,
  );
}

async function upsertKvEntry(
  subdomain: string,
  value: string,
  routingConfig: PreviewRoutingConfig,
): Promise<void> {
  const endpoint = getKvEndpoint(subdomain, routingConfig);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KV_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${routingConfig.apiToken}`,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: value,
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Cloudflare KV upsert failed (${response.status} ${response.statusText}): ${details.slice(0, 500)}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Cloudflare KV upsert timed out after ${KV_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function deletePreviewSubdomain(
  subdomain: string,
  expectedStoragePrefix?: string,
): Promise<void> {
  const routingConfig = getPreviewRoutingConfig();
  if (!routingConfig) return;

  if (expectedStoragePrefix) {
    try {
      const currentValue = await readKvEntry(subdomain, routingConfig);
      if (currentValue === null) {
        return;
      }
      if (currentValue !== expectedStoragePrefix) {
        logger.warn(
          { subdomain },
          "Skipping KV delete because subdomain is currently mapped to a different chat",
        );
        return;
      }
    } catch (err) {
      logger.warn(
        { err, subdomain },
        "Skipping KV delete because current ownership could not be verified",
      );
      return;
    }
  }

  const endpoint = getKvEndpoint(subdomain, routingConfig);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KV_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${routingConfig.apiToken}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      logger.warn(
        { subdomain, status: response.status },
        `Cloudflare KV delete failed (non-fatal): ${details.slice(0, 200)}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn(
        { subdomain },
        `Cloudflare KV delete timed out after ${KV_FETCH_TIMEOUT_MS}ms (non-fatal)`,
      );
    } else {
      logger.warn(
        { err, subdomain },
        "deletePreviewSubdomain failed (non-fatal)",
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function registerPreviewSubdomain(
  userId: string,
  chatId: string,
  customSubdomain?: string | null,
): Promise<PreviewRoutingResult | null> {
  const routingConfig = getPreviewRoutingConfig();
  if (!routingConfig) {
    logger.warn(
      { userId, chatId },
      "Preview subdomain registration skipped: Cloudflare routing config is incomplete",
    );
    return null;
  }

  const subdomain = await resolveSubdomainForRouting(
    userId,
    chatId,
    customSubdomain,
  );
  const storagePrefix = getChatStoragePrefix(userId, chatId);

  await upsertKvEntry(subdomain, storagePrefix, routingConfig);

  return {
    subdomain,
    storagePrefix,
    previewUrl: `https://${subdomain}.${routingConfig.rootDomain}`,
  };
}
