import { ConnectionOptions } from "bullmq";
import { Environment } from "./utils/logger.js";

export type DeploymentType = "path" | "subdomain";
type AwsCredentialConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};
type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

function validateEnvVar(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
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

function normalizeBasePath(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return "";
  }

  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = prefixed.replace(/\/+$/, "");

  return normalized === "/" ? "" : normalized;
}

function parseBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
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
  throw new Error(`${name} must be one of: true,false,1,0,yes,no`);
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
const DEFAULT_REDIS_DB = 0;

function parseRedisUrl(url: string): RedisConnectionConfig {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      throw new Error("Unsupported REDIS_URL protocol");
    }
    if (!parsed.hostname) {
      throw new Error("REDIS_URL must include hostname");
    }

    const dbSegment = parsed.pathname.replace(/^\//, "").trim();
    if (dbSegment !== "" && !/^\d+$/.test(dbSegment)) {
      throw new Error("REDIS_URL contains invalid DB index");
    }
    const db = dbSegment === ""
      ? DEFAULT_REDIS_DB
      : Number.parseInt(dbSegment, 10);

    const username = parsed.username
      ? decodeURIComponent(parsed.username)
      : undefined;
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined;
    const port = parsed.port
      ? validatePort("REDIS_URL", parsed.port)
      : DEFAULT_REDIS_PORT;

    return {
      host: parsed.hostname,
      port,
      db,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    throw new Error(`Invalid REDIS_URL format: ${url}`);
  }
}

function parseOptionalInt(
  name: string,
  value: string | undefined,
): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  return parsed;
}

function resolveRedisConnectionConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisConnectionConfig {
  if (env.REDIS_URL && env.REDIS_URL.trim() !== "") {
    return parseRedisUrl(env.REDIS_URL.trim());
  }

  const host = validateEnvVar("REDIS_HOST", env.REDIS_HOST);
  const port = validatePort("REDIS_PORT", env.REDIS_PORT);
  const username = env.REDIS_USERNAME?.trim() || undefined;
  const password = env.REDIS_PASSWORD?.trim() || undefined;
  const db = parseOptionalInt("REDIS_DB", env.REDIS_DB);
  const tlsEnabled = parseBoolean("REDIS_TLS", env.REDIS_TLS, false);

  return {
    host,
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(tlsEnabled ? { tls: {} } : {}),
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

export const DEPLOYMENT_TYPES = {
  PATH: "path",
  SUBDOMAIN: "subdomain",
} as const satisfies Record<string, DeploymentType>;

function isDeploymentType(value: string | undefined): value is DeploymentType {
  return (
    value === DEPLOYMENT_TYPES.PATH ||
    value === DEPLOYMENT_TYPES.SUBDOMAIN
  );
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

function resolveAwsCredentials(
  env: NodeJS.ProcessEnv = process.env,
): AwsCredentialConfig | undefined {
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = env.AWS_SESSION_TOKEN?.trim() || undefined;

  if (!accessKeyId && !secretAccessKey) {
    return undefined;
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be provided when using static AWS credentials.",
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

export const config = {
  redis: {
    get host(): string {
      return resolveRedisConnectionConfig().host;
    },
    get port(): number {
      return resolveRedisConnectionConfig().port;
    },
    get username(): string | undefined {
      return resolveRedisConnectionConfig().username;
    },
    get password(): string | undefined {
      return resolveRedisConnectionConfig().password;
    },
    get db(): number | undefined {
      return resolveRedisConnectionConfig().db;
    },
    get tls(): Record<string, never> | undefined {
      return resolveRedisConnectionConfig().tls;
    },
    get connectionOptions(): ConnectionOptions {
      return {
        host: this.host,
        port: this.port,
        ...(this.username ? { username: this.username } : {}),
        ...(this.password ? { password: this.password } : {}),
        ...(this.db !== undefined ? { db: this.db } : {}),
        ...(this.tls ? { tls: this.tls } : {}),
        maxRetriesPerRequest: null,
      };
    },
  },

  server: {
    port: validatePort("EDWARD_API_PORT", process.env.EDWARD_API_PORT),
    environment:
      (process.env.NODE_ENV as Environment) || Environment.Development,
    get apiBasePath(): string {
      return normalizeBasePath(process.env.API_BASE_PATH);
    },
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
    origins: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
      : [],
  },

  encryption: {
    key: validateEnvVar("ENCRYPTION_KEY", process.env.ENCRYPTION_KEY),
  },

  aws: {
    get credentials(): AwsCredentialConfig | undefined {
      return resolveAwsCredentials();
    },
    region: process.env.AWS_REGION || "ap-south-1",
    s3Bucket: validateEnvVar("AWS_BUCKET_NAME", process.env.AWS_BUCKET_NAME),
    s3CdnBucket: validateEnvVar(
      "AWS_CDN_BUCKET_NAME",
      process.env.AWS_CDN_BUCKET_NAME,
    ),
    assetsUrl: process.env.ASSETS_URL,
    cloudfrontDistributionUrl: process.env.CLOUDFRONT_DISTRIBUTION_URL,
    cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
    cloudfrontRoleArn: process.env.AWS_CLOUDFRONT_ROLE_ARN?.trim() || undefined,
    cloudfrontRoleSessionName: process.env.AWS_CLOUDFRONT_ROLE_SESSION_NAME
      ?.trim() || undefined,
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

  sandbox: {
    get enabled(): boolean {
      return parseBoolean("SANDBOX_ENABLED", process.env.SANDBOX_ENABLED, true);
    },
  },

  webSearch: {
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim() || undefined,
  },
} as const;

export type Config = typeof config;
