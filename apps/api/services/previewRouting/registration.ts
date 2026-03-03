import { chat, db, eq } from "@edward/auth";
import { createLogger } from "../../utils/logger.js";
import {
  deleteKvEntry,
  getChatStoragePrefix,
  getPreviewRoutingConfig,
  readKvEntry,
  upsertKvEntry,
} from "./kvClient.js";
import {
  resolveSubdomainForRouting,
  validateSubdomainFormat,
} from "./subdomain.js";

const logger = createLogger("PREVIEW_ROUTING");

export interface SubdomainAvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface PreviewRoutingResult {
  subdomain: string;
  previewUrl: string;
  storagePrefix: string;
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

  try {
    const result = await deleteKvEntry(subdomain, routingConfig);
    if (!result.ok) {
      if (result.timeout) {
        logger.warn(
          { subdomain },
          "Cloudflare KV delete timed out (non-fatal)",
        );
      } else {
        logger.warn(
          { subdomain, status: result.status },
          `Cloudflare KV delete failed (non-fatal): ${(result.details ?? "").slice(0, 200)}`,
        );
      }
    }
  } catch (err) {
    logger.warn(
      { err, subdomain },
      "deletePreviewSubdomain failed (non-fatal)",
    );
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
