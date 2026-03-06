import { ConnectionOptions } from "bullmq";
import { Environment } from "./utils/logger.js";

export type DeploymentType = "path" | "subdomain";
export type SandboxRuntime = "docker" | "fly" | "disabled";

function validateEnvVar(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnvVar(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstDefinedEnv(
  candidates: Array<string | undefined>,
): string | undefined {
  for (const candidate of candidates) {
    const normalized = optionalEnvVar(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  return fallback;
}

function validatePort(name: string, value: string | undefined): number {
  const port = parseInt(value || "", 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Invalid port number for ${name}: ${value}. Must be a number between 1-65535.`,
    );
  }
  return port;
}

export type TrustProxySetting = boolean | number | string | string[];

function parseTrustProxyList(value: string): string | string[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length <= 1) {
    return entries[0] ?? value;
  }

  return entries;
}

export function parseTrustProxy(
  value: string | undefined,
  fallback: boolean,
): TrustProxySetting {
  if (!value || value.trim() === "") {
    return fallback ? 1 : false;
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized === "true") return 1;
  if (normalized === "false") return false;

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return parseTrustProxyList(trimmed);
}

const DEFAULT_REDIS_PORT = 6379;

interface RedisConnectionSettings {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

function extractRedisUrl(raw: string): { url: string; forceTls: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("REDIS_URL is empty");
  }

  const urlMatch = trimmed.match(/rediss?:\/\/\S+/i);
  if (!urlMatch) {
    return { url: trimmed, forceTls: false };
  }

  const commandPrefix = trimmed.slice(0, urlMatch.index ?? 0);
  const forceTls = /\b--tls\b/.test(commandPrefix);

  return { url: urlMatch[0], forceTls };
}

function parseRedisUrl(raw: string): RedisConnectionSettings {
  try {
    const { url, forceTls } = extractRedisUrl(raw);
    const parsed = new URL(url);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      throw new Error(
        `Unsupported REDIS_URL protocol: ${parsed.protocol}. Use redis:// or rediss://`,
      );
    }

    const port = parsed.port
      ? validatePort("REDIS_URL", parsed.port)
      : DEFAULT_REDIS_PORT;

    const username = parsed.username
      ? decodeURIComponent(parsed.username)
      : undefined;
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined;

    const useTls = forceTls || parsed.protocol === "rediss:";

    return {
      host: parsed.hostname,
      port,
      username,
      password,
      tls: useTls ? {} : undefined,
    };
  } catch {
    throw new Error(`Invalid REDIS_URL format: ${raw}`);
  }
}

function resolveRedisConnectionSettings(): RedisConnectionSettings {
  if (process.env.REDIS_URL) {
    return parseRedisUrl(process.env.REDIS_URL);
  }

  return {
    host: validateEnvVar("REDIS_HOST", process.env.REDIS_HOST),
    port: validatePort("REDIS_PORT", process.env.REDIS_PORT),
  };
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function hasCompletePreviewRoutingConfig(env: NodeJS.ProcessEnv): boolean {
  return (
    hasValue(env.CLOUDFLARE_API_TOKEN) &&
    hasValue(env.CLOUDFLARE_ACCOUNT_ID) &&
    hasValue(env.CLOUDFLARE_KV_NAMESPACE_ID) &&
    hasValue(env.PREVIEW_ROOT_DOMAIN)
  );
}

function normalizeUrlOrigin(value: string | undefined): string | undefined {
  const normalized = optionalEnvVar(value);
  if (!normalized) {
    return undefined;
  }

  const withScheme = /^https?:\/\//i.test(normalized)
    ? normalized
    : normalized.startsWith("localhost") || normalized.startsWith("127.0.0.1")
      ? `http://${normalized}`
      : `https://${normalized}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    return undefined;
  }
}

function resolveCorsOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(",")
    .map((origin) => normalizeUrlOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  if (configuredOrigins && configuredOrigins.length > 0) {
    return [...new Set(configuredOrigins)];
  }

  const derivedOrigins = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.BETTER_AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  ]
    .map((value) => normalizeUrlOrigin(value))
    .filter((origin): origin is string => Boolean(origin));

  return [...new Set(derivedOrigins)];
}

export const DEPLOYMENT_TYPES = {
  PATH: "path",
  SUBDOMAIN: "subdomain",
} as const satisfies Record<string, DeploymentType>;

function isDeploymentType(value: string | undefined): value is DeploymentType {
  return value === DEPLOYMENT_TYPES.PATH || value === DEPLOYMENT_TYPES.SUBDOMAIN;
}

export function resolveDeploymentType(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentType {
  const raw = env.EDWARD_DEPLOYMENT_TYPE?.trim().toLowerCase();

  if (isDeploymentType(raw)) {
    return raw;
  }

  return hasCompletePreviewRoutingConfig(env)
    ? DEPLOYMENT_TYPES.SUBDOMAIN
    : DEPLOYMENT_TYPES.PATH;
}

function resolveSandboxRuntime(value: string | undefined): SandboxRuntime {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "fly") {
    return "fly";
  }
  return normalized === "disabled" ? "disabled" : "docker";
}

export const config = {
  redis: {
    get connectionOptions(): ConnectionOptions {
      return resolveRedisConnectionSettings();
    },
    get host(): string {
      return resolveRedisConnectionSettings().host;
    },
    get port(): number {
      return resolveRedisConnectionSettings().port;
    },
  },

  server: {
    port: validatePort(
      "EDWARD_API_PORT/PORT",
      firstDefinedEnv([process.env.EDWARD_API_PORT, process.env.PORT]) ?? "4000",
    ),
    environment:
      (process.env.NODE_ENV as Environment) || Environment.Development,
    isDevelopment(): boolean {
      return this.environment === Environment.Development;
    },
    isProduction(): boolean {
      return this.environment === Environment.Production;
    },
    isTest(): boolean {
      return this.environment === Environment.Test;
    },
    get trustProxy(): TrustProxySetting {
      return parseTrustProxy(process.env.TRUST_PROXY, this.isProduction());
    },
  },

  cors: {
    origins: resolveCorsOrigins(),
  },

  encryption: {
    key: validateEnvVar("ENCRYPTION_KEY", process.env.ENCRYPTION_KEY),
  },

  aws: {
    accessKeyId: optionalEnvVar(process.env.AWS_ACCESS_KEY_ID),
    secretAccessKey: optionalEnvVar(process.env.AWS_SECRET_ACCESS_KEY),
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: validateEnvVar(
      "AWS_BUCKET_NAME or SANDBOX_S3_BUCKET or S3_BUCKET",
      firstDefinedEnv([
        process.env.AWS_BUCKET_NAME,
        process.env.SANDBOX_S3_BUCKET,
        process.env.S3_BUCKET,
      ]),
    ),
    s3CdnBucket:
      firstDefinedEnv([
        process.env.AWS_CDN_BUCKET_NAME,
        process.env.CDN_BUCKET_NAME,
        process.env.S3_CDN_BUCKET,
      ]) ??
      validateEnvVar(
        "AWS_BUCKET_NAME or SANDBOX_S3_BUCKET or S3_BUCKET",
        firstDefinedEnv([
          process.env.AWS_BUCKET_NAME,
          process.env.SANDBOX_S3_BUCKET,
          process.env.S3_BUCKET,
        ]),
      ),
    endpoint: firstDefinedEnv([
      process.env.S3_ENDPOINT,
      process.env.AWS_ENDPOINT_URL_S3,
      process.env.AWS_S3_ENDPOINT,
    ]),
    assetsUrl: firstDefinedEnv([
      process.env.ASSETS_URL,
      process.env.S3_PUBLIC_BASE_URL,
      process.env.PREVIEW_ASSETS_BASE_URL,
      process.env.CLOUDFRONT_DISTRIBUTION_URL,
    ]),
    cloudfrontDistributionUrl: process.env.CLOUDFRONT_DISTRIBUTION_URL,
    cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },

  deployment: {
    get type(): DeploymentType {
      return resolveDeploymentType();
    },
  },

  previewRouting: {
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareKvNamespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
    rootDomain: process.env.PREVIEW_ROOT_DOMAIN,
  },

  docker: {
    get prewarmImage(): string {
      return validateEnvVar(
        "PREWARM_SANDBOX_IMAGE",
        process.env.PREWARM_SANDBOX_IMAGE,
      );
    },
    get registryBase(): string {
      return validateEnvVar(
        "DOCKER_REGISTRY_BASE",
        process.env.DOCKER_REGISTRY_BASE,
      );
    },
  },

  fly: {
    apiToken: optionalEnvVar(process.env.FLY_API_TOKEN),
    appName: optionalEnvVar(process.env.FLY_APP_NAME),
    org: optionalEnvVar(process.env.FLY_ORG),
    publicHost:
      optionalEnvVar(process.env.FLY_PUBLIC_HOSTNAME) ??
      (optionalEnvVar(process.env.FLY_APP_NAME)
        ? `${process.env.FLY_APP_NAME!.trim()}.fly.dev`
        : undefined),
  },

  sandbox: {
    runtime: resolveSandboxRuntime(
      firstDefinedEnv([process.env.SANDBOX_RUNTIME, process.env.SANDBOX_RUNTIME_MODE]),
    ),
    required: parseBoolean(process.env.SANDBOX_RUNTIME_REQUIRED, true),
  },

  webSearch: {
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim() || undefined,
  },
} as const;

export type Config = typeof config;
