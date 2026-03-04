import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

function requireEnvVar(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} environment variable is not set`);
  }

  return normalized;
}

const connectionString = requireEnvVar("DATABASE_URL", process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === "production";

type DatabaseSslMode = "require" | "allow" | "prefer" | "verify-full" | false;

const ALLOWED_SSL_MODES = new Set(["require", "allow", "prefer", "verify-full"]);

function parseOptionalPositiveInt(name: string, value: string | undefined): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(trimmed);

  return parsed;
}

function resolveDatabaseSslMode(): DatabaseSslMode {
  const explicit = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (explicit) {
    if (explicit === "true" || explicit === "1" || explicit === "yes") {
      return "require";
    }
    if (explicit === "false" || explicit === "0" || explicit === "no") {
      return false;
    }
    if (ALLOWED_SSL_MODES.has(explicit)) {
      return explicit as Exclude<DatabaseSslMode, false>;
    }
    throw new Error(
      "DATABASE_SSL must be one of true/false/require/allow/prefer/verify-full",
    );
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get("sslmode")?.trim().toLowerCase();
    if (!sslMode || sslMode === "disable") {
      return isProduction ? "require" : false;
    }
    if (ALLOWED_SSL_MODES.has(sslMode)) {
      return sslMode as Exclude<DatabaseSslMode, false>;
    }
  } catch (_error: unknown) {
    return isProduction ? "require" : false;
  }

  return isProduction ? "require" : false;
}

function resolvePoolMax(): number {
  const parsed = parseOptionalPositiveInt("DATABASE_POOL_MAX", process.env.DATABASE_POOL_MAX);
  if (parsed) {
    return parsed;
  }

  return isProduction ? 20 : 10;
}

function resolveConnectTimeoutSeconds(): number {
  return parseOptionalPositiveInt(
    "DATABASE_CONNECT_TIMEOUT_SECONDS",
    process.env.DATABASE_CONNECT_TIMEOUT_SECONDS,
  ) ?? 10;
}

function resolveIdleTimeoutSeconds(): number | undefined {
  return parseOptionalPositiveInt(
    "DATABASE_IDLE_TIMEOUT_SECONDS",
    process.env.DATABASE_IDLE_TIMEOUT_SECONDS,
  );
}

const client = postgres(connectionString, {
  ssl: resolveDatabaseSslMode(),
  max: resolvePoolMax(),
  connect_timeout: resolveConnectTimeoutSeconds(),
  idle_timeout: resolveIdleTimeoutSeconds(),
});

export const db = drizzle(client, { schema });
