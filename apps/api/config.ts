import { ConnectionOptions } from "bullmq";
import { Environment } from "./utils/logger.js";
import { DeploymentType } from "./services/sandbox/builder/basePathInjector.js";

function validateEnvVar(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

const DEFAULT_REDIS_PORT = 6379;

function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    const port = parsed.port
      ? validatePort("REDIS_URL", parsed.port)
      : DEFAULT_REDIS_PORT;
    return { host: parsed.hostname, port };
  } catch {
    throw new Error(`Invalid REDIS_URL format: ${url}`);
  }
}

export const config = {
  redis: {
    get host(): string {
      if (process.env.REDIS_URL) {
        return parseRedisUrl(process.env.REDIS_URL).host;
      }
      return validateEnvVar("REDIS_HOST", process.env.REDIS_HOST);
    },
    get port(): number {
      if (process.env.REDIS_URL) {
        return parseRedisUrl(process.env.REDIS_URL).port;
      }
      return validatePort("REDIS_PORT", process.env.REDIS_PORT);
    },
    get url(): string {
      return process.env.REDIS_URL || `redis://${this.host}:${this.port}`;
    },
    get connectionOptions(): ConnectionOptions {
      return {
        host: this.host,
        port: this.port,
      };
    },
  },

  server: {
    port: validatePort("EDWARD_API_PORT", process.env.EDWARD_API_PORT),
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
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: process.env.AWS_BUCKET_NAME,
    cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN,
    cloudfrontDistributionUrl: process.env.CLOUDFRONT_DISTRIBUTION_URL,
    cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },

  deployment: {
    type: (process.env.EDWARD_DEPLOYMENT_TYPE as DeploymentType) || "path",
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
} as const;

export type Config = typeof config;
