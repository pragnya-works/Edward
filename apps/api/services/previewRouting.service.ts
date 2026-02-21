import { createHash } from "node:crypto";
import {
  adjectives,
  animals,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { buildS3Key } from "./storage/key.utils.js";

const logger = createLogger("PREVIEW_ROUTING");

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

export function generatePreviewSubdomain(userId: string, chatId: string): string {
  const digest = createHash("sha256")
    .update(`${userId}:${chatId}`)
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

export async function registerPreviewSubdomain(
  userId: string,
  chatId: string,
): Promise<PreviewRoutingResult | null> {
  const routingConfig = getPreviewRoutingConfig();
  if (!routingConfig) {
    logger.warn(
      { userId, chatId },
      "Preview subdomain registration skipped: Cloudflare routing config is incomplete",
    );
    return null;
  }

  const subdomain = generatePreviewSubdomain(userId, chatId);
  const storagePrefix = buildS3Key(userId, chatId).replace(/\/$/, "");

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${routingConfig.accountId}` +
    `/storage/kv/namespaces/${routingConfig.namespaceId}/values/${subdomain}`;

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${routingConfig.apiToken}`,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: storagePrefix,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Cloudflare KV upsert failed (${response.status} ${response.statusText}): ${details.slice(0, 500)}`,
    );
  }

  return {
    subdomain,
    storagePrefix,
    previewUrl: `https://${subdomain}.${routingConfig.rootDomain}`,
  };
}
