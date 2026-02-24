import { config } from "../../app.config.js";
import { buildS3Key } from "../storage/key.utils.js";

const KV_FETCH_TIMEOUT_MS = 10000;

export interface PreviewRoutingConfig {
  apiToken: string;
  accountId: string;
  namespaceId: string;
  rootDomain: string;
}

function normalizeRootDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function getPreviewRoutingConfig(): PreviewRoutingConfig | null {
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

export function getChatStoragePrefix(userId: string, chatId: string): string {
  return buildS3Key(userId, chatId).replace(/\/$/, "");
}

function getKvEndpoint(subdomain: string, routingConfig: PreviewRoutingConfig): string {
  return (
    `https://api.cloudflare.com/client/v4/accounts/${routingConfig.accountId}` +
    `/storage/kv/namespaces/${routingConfig.namespaceId}/values/${subdomain}`
  );
}

export async function readKvEntry(
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

export async function upsertKvEntry(
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

export async function deleteKvEntry(
  subdomain: string,
  routingConfig: PreviewRoutingConfig,
): Promise<{ ok: boolean; status?: number; details?: string; timeout?: boolean }> {
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
      return {
        ok: false,
        status: response.status,
        details: details.slice(0, 200),
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, timeout: true };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
