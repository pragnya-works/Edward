import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadConfigModule() {
  vi.resetModules();
  return import("../app.config.js");
}

describe("app.config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.SANDBOX_RUNTIME = "disabled";
    process.env.SANDBOX_RUNTIME_REQUIRED = "false";
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

  it("fails fast on unsupported sandbox runtime values", async () => {
    process.env.SANDBOX_RUNTIME = "docker";

    await expect(loadConfigModule()).rejects.toThrow(
      'Invalid sandbox runtime: docker. Expected "vercel" or "disabled".',
    );
  });

  it("fails fast on unsupported Vercel sandbox runtime values", async () => {
    process.env.VERCEL_SANDBOX_RUNTIME = "node25";

    await expect(loadConfigModule()).rejects.toThrow(
      "Invalid VERCEL_SANDBOX_RUNTIME: node25. Allowed values: node22, node24.",
    );
  });

  it("rejects malformed positive integer values for Vercel sandbox settings", async () => {
    process.env.VERCEL_SANDBOX_TIMEOUT_MS = "15ms";

    await expect(loadConfigModule()).rejects.toThrow(
      "Invalid positive integer for VERCEL_SANDBOX_TIMEOUT_MS: 15ms",
    );
  });

  it("rejects malformed Vercel sandbox vcpu values", async () => {
    process.env.VERCEL_SANDBOX_VCPUS = "abc";

    await expect(loadConfigModule()).rejects.toThrow(
      "Invalid positive integer for VERCEL_SANDBOX_VCPUS: abc",
    );
  });

  it("rejects zero Vercel sandbox vcpu values", async () => {
    process.env.VERCEL_SANDBOX_VCPUS = "0";

    await expect(loadConfigModule()).rejects.toThrow(
      "Invalid positive integer for VERCEL_SANDBOX_VCPUS: 0",
    );
  });

  it("rejects unsupported NODE_ENV values instead of defaulting silently", async () => {
    process.env.NODE_ENV = "productionish";

    await expect(loadConfigModule()).rejects.toThrow(
      "Invalid NODE_ENV: productionish. Allowed values: development, production, test.",
    );
  });

  it("rejects blank NODE_ENV values instead of defaulting silently", async () => {
    process.env.NODE_ENV = "   ";

    await expect(loadConfigModule()).rejects.toThrow(
      /Invalid NODE_ENV: .*Allowed values: development, production, test\./,
    );
  });

  it("requires Vercel sandbox credentials when the runtime is required", async () => {
    delete process.env.SANDBOX_RUNTIME;
    delete process.env.SANDBOX_RUNTIME_MODE;
    delete process.env.SANDBOX_RUNTIME_REQUIRED;
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_TEAM_ID;
    delete process.env.VERCEL_PROJECT_ID;

    await expect(loadConfigModule()).rejects.toThrow(
      "Missing required environment variable: VERCEL_TOKEN",
    );
  });

  it("identifies a missing Vercel team id when sandbox runtime is required", async () => {
    delete process.env.SANDBOX_RUNTIME;
    delete process.env.SANDBOX_RUNTIME_MODE;
    delete process.env.SANDBOX_RUNTIME_REQUIRED;
    process.env.VERCEL_TOKEN = "token";
    delete process.env.VERCEL_TEAM_ID;
    process.env.VERCEL_PROJECT_ID = "project";

    await expect(loadConfigModule()).rejects.toThrow(
      "Missing required environment variable: VERCEL_TEAM_ID",
    );
  });

  it("identifies a missing Vercel project id when sandbox runtime is required", async () => {
    delete process.env.SANDBOX_RUNTIME;
    delete process.env.SANDBOX_RUNTIME_MODE;
    delete process.env.SANDBOX_RUNTIME_REQUIRED;
    process.env.VERCEL_TOKEN = "token";
    process.env.VERCEL_TEAM_ID = "team";
    delete process.env.VERCEL_PROJECT_ID;

    await expect(loadConfigModule()).rejects.toThrow(
      "Missing required environment variable: VERCEL_PROJECT_ID",
    );
  });
});
