import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db.js";

function getEnvVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

function getOptionalEnvVariable(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function getBaseAuthUrl(): string {
  return getEnvVariable("BETTER_AUTH_URL");
}

function deriveCookieDomain(baseUrl: string): string | undefined {
  const explicit = getOptionalEnvVariable("BETTER_AUTH_COOKIE_DOMAIN");
  if (explicit) {
    return explicit.replace(/^\./, "");
  }

  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      /^[\d.]+$/.test(hostname) ||
      hostname.includes(":")
    ) {
      return undefined;
    }

    const parts = hostname.split(".").filter(Boolean);
    if (parts.length < 2) {
      return undefined;
    }

    return parts.slice(-2).join(".");
  } catch {
    return undefined;
  }
}

function getTrustedOrigins(baseUrl: string): string[] {
  const origins = new Set<string>();

  const candidates = [
    baseUrl,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_API_URL,
    ...parseOriginList(process.env.CORS_ORIGIN),
    ...parseOriginList(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

const baseURL = getBaseAuthUrl();
const cookieDomain = deriveCookieDomain(baseURL);

export const auth = betterAuth({
  baseURL,
  secret: getEnvVariable("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  trustedOrigins: getTrustedOrigins(baseURL),
  advanced: cookieDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: cookieDomain,
        },
      }
    : undefined,
  socialProviders: {
    github: {
      clientId: getEnvVariable("GITHUB_CLIENT_ID"),
      clientSecret: getEnvVariable("GITHUB_CLIENT_SECRET"),
      scope: ["repo", "user"],
    },
  },
});
