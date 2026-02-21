import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadService() {
  const mod = await import("../../services/previewRouting.service.js");
  return {
    generatePreviewSubdomain: mod.generatePreviewSubdomain,
    registerPreviewSubdomain: mod.registerPreviewSubdomain,
  };
}

describe("previewRouting.service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.CLOUDFLARE_API_TOKEN = "cf-token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "cf-account";
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = "cf-namespace";
    process.env.PREVIEW_ROOT_DOMAIN = "edwardd.app";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("generates deterministic preview subdomains", async () => {
    const { generatePreviewSubdomain } = await loadService();
    const first = generatePreviewSubdomain("user-1", "chat-1");
    const second = generatePreviewSubdomain("user-1", "chat-1");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{5}$/);
  });

  it("returns null when routing config is incomplete", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    const { registerPreviewSubdomain } = await loadService();

    const result = await registerPreviewSubdomain("user-1", "chat-1");

    expect(result).toBeNull();
  });

  it("upserts KV mapping and returns subdomain URL", async () => {
    const { registerPreviewSubdomain } = await loadService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await registerPreviewSubdomain("user/id", "chat.id");

    expect(result).not.toBeNull();
    expect(result?.storagePrefix).toBe("user_id/chat.id");
    expect(result?.previewUrl).toBe(`https://${result?.subdomain}.edwardd.app`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain("/accounts/cf-account/storage/kv/namespaces/cf-namespace/values/");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe("user_id/chat.id");
  });
});
