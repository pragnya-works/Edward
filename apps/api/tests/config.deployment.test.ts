import { describe, expect, it } from "vitest";
import { DEPLOYMENT_TYPES, resolveDeploymentType } from "../config.js";

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("resolveDeploymentType", () => {
  it("returns explicit subdomain mode regardless of casing/spacing", () => {
    const mode = resolveDeploymentType(
      makeEnv({ EDWARD_DEPLOYMENT_TYPE: "  SubDomain " }),
    );
    expect(mode).toBe(DEPLOYMENT_TYPES.SUBDOMAIN);
  });

  it("returns explicit path mode", () => {
    const mode = resolveDeploymentType(
      makeEnv({ EDWARD_DEPLOYMENT_TYPE: "path" }),
    );
    expect(mode).toBe(DEPLOYMENT_TYPES.PATH);
  });

  it("defaults to subdomain when Cloudflare routing config is complete", () => {
    const mode = resolveDeploymentType(
      makeEnv({
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_KV_NAMESPACE_ID: "namespace",
        PREVIEW_ROOT_DOMAIN: "edwardd.app",
      }),
    );
    expect(mode).toBe(DEPLOYMENT_TYPES.SUBDOMAIN);
  });

  it("defaults to path when Cloudflare routing config is incomplete", () => {
    const mode = resolveDeploymentType(
      makeEnv({
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        PREVIEW_ROOT_DOMAIN: "edwardd.app",
      }),
    );
    expect(mode).toBe(DEPLOYMENT_TYPES.PATH);
  });

  it("treats invalid deployment values as auto-detect", () => {
    const mode = resolveDeploymentType(
      makeEnv({
        EDWARD_DEPLOYMENT_TYPE: "preview",
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_KV_NAMESPACE_ID: "namespace",
        PREVIEW_ROOT_DOMAIN: "edwardd.app",
      }),
    );
    expect(mode).toBe(DEPLOYMENT_TYPES.SUBDOMAIN);
  });
});
