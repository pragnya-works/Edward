import { sanitizePathComponent } from "./storage/key.utils.js";
import { config } from "../config.js";

function getCloudfrontUrl(): string | null {
  const cloudfrontUrl = config.aws.cloudfrontDistributionUrl?.replace(/\/$/, "");
  return cloudfrontUrl || null;
}

function getRootDomain(): string | null {
  const domain = config.previewRouting.rootDomain?.trim();
  if (!domain) return null;
  return domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function buildPathPreviewUrl(userId: string, chatId: string): string | null {
  const cloudfrontUrl = getCloudfrontUrl();
  if (!cloudfrontUrl) return null;

  const pathParts = [
    sanitizePathComponent(userId),
    sanitizePathComponent(chatId),
  ];

  return `${cloudfrontUrl}/${pathParts.join("/")}/`;
}

export function buildSubdomainPreviewUrl(subdomain: string): string | null {
  const rootDomain = getRootDomain();
  if (!rootDomain) return null;
  return `https://${subdomain}.${rootDomain}`;
}

export function buildPreviewUrl(userId: string, chatId: string): string | null {
  return buildPathPreviewUrl(userId, chatId);
}
