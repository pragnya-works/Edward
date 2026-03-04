import "dotenv/config";
import { db, user } from "@edward/auth";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { DEPLOYMENT_TYPES, config } from "../../app.config.js";
import { createRedisClient } from "../../lib/redis.js";
import { s3Client } from "../../services/storage/storage.config.js";
import { getCloudFrontClient } from "../../services/storage/cloudfront.config.js";
import {
  isSandboxEnabled,
  isSandboxRuntimeAvailable,
} from "../../services/sandbox/lifecycle/control.js";
import { getPreviewRoutingConfig } from "../../services/previewRouting/kvClient.js";
import { createLogger } from "../../utils/logger.js";

type PreflightCheck = {
  name: string;
  run: () => Promise<void>;
};

const CLOUDFLARE_CHECK_TIMEOUT_MS = 5000;
const processLogger = createLogger("DEPLOY_PREFLIGHT");
processLogger.level = "info";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function assertHttpsUrl(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`${name} is required in production.`);
  }

  if (!isHttpsUrl(value)) {
    throw new Error(`${name} must be an https URL in production.`);
  }
}

function assertCorsOrigins(): void {
  const origins = config.cors.origins;
  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must include at least one origin in production.");
  }

  for (const origin of origins) {
    if (!isHttpsUrl(origin)) {
      throw new Error(`CORS_ORIGIN contains non-https origin: ${origin}`);
    }
  }
}

async function checkDatabaseConnection(): Promise<void> {
  await db.select({ id: user.id }).from(user).limit(1);
}

async function checkRedisConnection(): Promise<void> {
  const client = createRedisClient({
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on("error", () => undefined);

  try {
    await client.connect();
    const response = await client.ping();
    if (typeof response !== "string" || response.toUpperCase() !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${String(response)}`);
    }
  } catch (error) {
    throw new Error(`Redis connection failed: ${formatError(error)}`);
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function checkSandboxRuntime(): Promise<void> {
  if (!isSandboxEnabled()) {
    return;
  }

  const available = await isSandboxRuntimeAvailable();
  if (!available) {
    throw new Error("SANDBOX_ENABLED=true but Docker runtime is unavailable.");
  }
}

async function checkS3Buckets(): Promise<void> {
  await s3Client.send(new HeadBucketCommand({ Bucket: config.aws.s3Bucket }));
  await s3Client.send(new HeadBucketCommand({ Bucket: config.aws.s3CdnBucket }));
}

async function checkCloudFrontAccess(): Promise<void> {
  const distributionId = config.aws.cloudfrontDistributionId?.trim();
  if (!distributionId) {
    throw new Error("CLOUDFRONT_DISTRIBUTION_ID is required.");
  }

  const cloudFrontClient = await getCloudFrontClient();
  if (!cloudFrontClient) {
    throw new Error("Failed to initialize CloudFront client.");
  }

  await cloudFrontClient.send(
    new GetDistributionCommand({ Id: distributionId }),
  );
}

function getCloudflareNamespaceUrl(params: {
  accountId: string;
  namespaceId: string;
}): string {
  return (
    `https://api.cloudflare.com/client/v4/accounts/${params.accountId}` +
    `/storage/kv/namespaces/${params.namespaceId}`
  );
}

async function checkCloudflareRouting(): Promise<void> {
  if (config.deployment.type !== DEPLOYMENT_TYPES.SUBDOMAIN) {
    return;
  }

  const routingConfig = getPreviewRoutingConfig();
  if (!routingConfig) {
    throw new Error(
      "Subdomain deployment requires CLOUDFLARE_* and PREVIEW_ROOT_DOMAIN.",
    );
  }

  const endpoint = getCloudflareNamespaceUrl({
    accountId: routingConfig.accountId,
    namespaceId: routingConfig.namespaceId,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_CHECK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${routingConfig.apiToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Cloudflare KV namespace check timed out after ${CLOUDFLARE_CHECK_TIMEOUT_MS}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Cloudflare KV namespace check failed (${response.status}): ${details.slice(0, 200)}`,
    );
  }
}

function createProductionConfigCheck(): PreflightCheck {
  return {
    name: "Production URL/security configuration",
    run: async () => {
      if (!config.server.isProduction()) {
        throw new Error("NODE_ENV must be production for deploy preflight.");
      }

      assertCorsOrigins();
      assertHttpsUrl("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
      assertHttpsUrl("ASSETS_URL", process.env.ASSETS_URL);
      assertHttpsUrl(
        "CLOUDFRONT_DISTRIBUTION_URL",
        process.env.CLOUDFRONT_DISTRIBUTION_URL,
      );
    },
  };
}

function createChecks(): PreflightCheck[] {
  return [
    createProductionConfigCheck(),
    { name: "Postgres connectivity", run: checkDatabaseConnection },
    { name: "Redis connectivity", run: checkRedisConnection },
    { name: "Sandbox runtime availability", run: checkSandboxRuntime },
    { name: "S3 bucket access", run: checkS3Buckets },
    { name: "CloudFront access", run: checkCloudFrontAccess },
    { name: "Cloudflare preview routing access", run: checkCloudflareRouting },
  ];
}

async function runCheck(check: PreflightCheck): Promise<Error | null> {
  process.stdout.write(`- ${check.name}... `);
  try {
    await check.run();
    process.stdout.write("OK\n");
    return null;
  } catch (error) {
    const normalized = error instanceof Error
      ? error
      : new Error(formatError(error));
    process.stdout.write(`FAILED\n  ${normalized.message}\n`);
    return normalized;
  }
}

async function runPreflight(): Promise<number> {
  const checks = createChecks();
  const [configCheck, ...runtimeChecks] = checks;
  let failed = false;

  if (!configCheck) {
    return 0;
  }

  const configError = await runCheck(configCheck);
  if (configError) {
    processLogger.error(
      "Skipping runtime connectivity checks because production configuration failed.",
    );
    return 1;
  }

  for (const check of runtimeChecks) {
    const checkError = await runCheck(check);
    if (checkError) {
      failed = true;
    }
  }

  return failed ? 1 : 0;
}

const exitCode = await runPreflight();
if (exitCode === 0) {
  processLogger.info("Deploy preflight passed.");
} else {
  processLogger.error("Deploy preflight failed.");
}
process.exit(exitCode);
