import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadPreviewService() {
  const mod = await import("../../services/preview.service.js");
  return {
    buildPathPreviewUrl: mod.buildPathPreviewUrl,
    buildSubdomainPreviewUrl: mod.buildSubdomainPreviewUrl,
    buildPreviewUrl: mod.buildPreviewUrl,
  };
}

describe("preview.service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.CLOUDFRONT_DISTRIBUTION_URL = "https://d111111abcdef8.cloudfront.net/";
    process.env.PREVIEW_ROOT_DOMAIN = "edwardd.app";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds path preview URL with sanitized components", async () => {
    const { buildPathPreviewUrl, buildPreviewUrl } = await loadPreviewService();

    const pathUrl = buildPathPreviewUrl("user/id", "chat.id");
    const defaultUrl = buildPreviewUrl("user/id", "chat.id");

    expect(pathUrl).toBe("https://d111111abcdef8.cloudfront.net/user_id/chat.id/");
    expect(defaultUrl).toBe(pathUrl);
  });

  it("returns null when CloudFront distribution URL is missing", async () => {
    delete process.env.CLOUDFRONT_DISTRIBUTION_URL;
    const { buildPathPreviewUrl } = await loadPreviewService();

    const result = buildPathPreviewUrl("u1", "c1");

    expect(result).toBeNull();
  });

  it("builds subdomain preview URL from root domain", async () => {
    const { buildSubdomainPreviewUrl } = await loadPreviewService();

    const result = buildSubdomainPreviewUrl("bright-wolf-abc12");

    expect(result).toBe("https://bright-wolf-abc12.edwardd.app");
  });
});
