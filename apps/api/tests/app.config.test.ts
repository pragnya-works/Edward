import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadConfigModule() {
  vi.resetModules();
  return import("../app.config.js");
}

describe("app.config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("falls back to PORT and preserves auth/TLS from REDIS_URL", async () => {
    delete process.env.EDWARD_API_PORT;
    process.env.PORT = "3001";
    process.env.REDIS_URL =
      "rediss://default:super-secret@us1-dear-redfish-12345.upstash.io:6380";

    const { config } = await loadConfigModule();

    expect(config.server.port).toBe(3001);
    expect(config.redis.connectionOptions).toMatchObject({
      host: "us1-dear-redfish-12345.upstash.io",
      port: 6380,
      username: "default",
      password: "super-secret",
      tls: {},
    });
  });

  it("accepts S3 aliases, derives CORS origins, and supports disabled sandbox runtime", async () => {
    delete process.env.CORS_ORIGIN;
    delete process.env.AWS_BUCKET_NAME;
    delete process.env.AWS_CDN_BUCKET_NAME;
    delete process.env.ASSETS_URL;

    process.env.S3_BUCKET = "deploy-bucket";
    process.env.S3_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
    process.env.S3_PUBLIC_BASE_URL =
      "https://deploy-bucket.s3.us-east-1.amazonaws.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://edward-app.vercel.app";
    process.env.BETTER_AUTH_URL = "https://edward-app.vercel.app";
    process.env.SANDBOX_RUNTIME = "disabled";
    process.env.SANDBOX_RUNTIME_REQUIRED = "false";

    const { config } = await loadConfigModule();

    expect(config.aws.s3Bucket).toBe("deploy-bucket");
    expect(config.aws.s3CdnBucket).toBe("deploy-bucket");
    expect(config.aws.endpoint).toBe("https://s3.us-east-1.amazonaws.com");
    expect(config.aws.assetsUrl).toBe(
      "https://deploy-bucket.s3.us-east-1.amazonaws.com",
    );
    expect(config.cors.origins).toEqual(["https://edward-app.vercel.app"]);
    expect(config.sandbox.runtime).toBe("disabled");
    expect(config.sandbox.required).toBe(false);
  });
});
