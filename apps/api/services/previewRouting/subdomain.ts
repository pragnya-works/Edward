import { createHash } from "node:crypto";
import {
  adjectives,
  animals,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { and, chat, db, eq, isNull } from "@edward/auth";
import { SUBDOMAIN_RESERVED } from "@edward/shared/constants";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("PREVIEW_ROUTING");
const SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS = 5;
const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export interface SubdomainValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateSubdomainFormat(
  subdomain: string,
): SubdomainValidationResult {
  if (!subdomain || subdomain.length < 3) {
    return { valid: false, reason: "Subdomain must be at least 3 characters." };
  }
  if (subdomain.length > 63) {
    return {
      valid: false,
      reason: "Subdomain must be 63 characters or fewer.",
    };
  }
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return {
      valid: false,
      reason:
        "Only lowercase letters, numbers, and hyphens are allowed. Cannot start or end with a hyphen.",
    };
  }
  if (SUBDOMAIN_RESERVED.has(subdomain)) {
    return { valid: false, reason: `"${subdomain}" is a reserved word.` };
  }
  return { valid: true };
}

export function generatePreviewSubdomain(
  userId: string,
  chatId: string,
  attempt = 0,
): string {
  const digestSource =
    attempt === 0 ? `${userId}:${chatId}` : `${userId}:${chatId}:${attempt}`;
  const digest = createHash("sha256")
    .update(digestSource)
    .digest("hex")
    .toLowerCase();

  const seed = parseInt(digest.slice(0, 8), 16);
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "-",
    style: "lowerCase",
    length: 2,
    seed,
  }).replace(/[^a-z0-9-]/g, "-");

  const uniqueSuffix = parseInt(digest.slice(16, 24), 16)
    .toString(36)
    .slice(0, 5)
    .padStart(5, "0");

  return `${name}-${uniqueSuffix}`;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function assertValidResolvedSubdomain(
  subdomain: string,
  source: "provided" | "stored",
): string {
  const validation = validateSubdomainFormat(subdomain);
  if (!validation.valid) {
    throw new Error(
      `Invalid ${source} subdomain "${subdomain}": ${validation.reason ?? "format check failed"}`,
    );
  }
  return subdomain;
}

export async function resolveSubdomainForRouting(
  userId: string,
  chatId: string,
  customSubdomain?: string | null,
): Promise<string> {
  const providedSubdomain = customSubdomain?.trim();
  if (providedSubdomain) {
    return assertValidResolvedSubdomain(providedSubdomain, "provided");
  }

  for (let attempt = 0; attempt < SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generatePreviewSubdomain(userId, chatId, attempt);
    try {
      const claimed = await db
        .update(chat)
        .set({ customSubdomain: candidate, updatedAt: new Date() })
        .where(and(eq(chat.id, chatId), isNull(chat.customSubdomain)))
        .returning({ customSubdomain: chat.customSubdomain });

      if (claimed.length > 0) {
        return assertValidResolvedSubdomain(
          claimed[0]!.customSubdomain ?? candidate,
          "stored",
        );
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        logger.warn(
          { chatId, candidate, attempt },
          "Generated preview subdomain collided with an existing record; retrying",
        );
        continue;
      }
      throw error;
    }

    const [existing] = await db
      .select({ customSubdomain: chat.customSubdomain })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (existing?.customSubdomain) {
      return assertValidResolvedSubdomain(existing.customSubdomain, "stored");
    }
  }

  throw new Error(
    `Unable to assign a unique preview subdomain after ${SUBDOMAIN_ASSIGNMENT_MAX_ATTEMPTS} attempts`,
  );
}
