import { sanitizePathComponent } from "./storage/key.utils.js";
import { config } from "../app.config.js";

function getPreviewAssetsBaseUrl(): string | null {
  const publicBaseUrl = config.aws.assetsUrl?.replace(/\/$/, "");
  if (publicBaseUrl) {
    return publicBaseUrl;
  }

  const cloudfrontUrl = config.aws.cloudfrontDistributionUrl?.replace(/\/$/, "");
  return cloudfrontUrl || null;
}

function getRootDomain(): string | null {
  const domain = config.previewRouting.rootDomain?.trim();
  if (!domain) return null;
  return domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function buildPathPreviewUrl(userId: string, chatId: string): string | null {
  const previewBaseUrl = getPreviewAssetsBaseUrl();
  if (!previewBaseUrl) return null;

  const pathParts = [
    sanitizePathComponent(userId),
    sanitizePathComponent(chatId),
  ];

  return `${previewBaseUrl}/${pathParts.join("/")}/preview/`;
}

export function buildSubdomainPreviewUrl(subdomain: string): string | null {
  const rootDomain = getRootDomain();
  if (!rootDomain) return null;
  return `https://${subdomain}.${rootDomain}`;
}
