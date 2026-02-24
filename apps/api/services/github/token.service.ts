import { account, and, db, eq } from "@edward/auth";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import {
  decryptSecret,
  encryptSecret,
  isSecretEnvelope,
} from "../../utils/secretEnvelope.js";
import { GITHUB_PROVIDER_ID } from "./shared.service.js";

export async function getGithubToken(userId: string): Promise<string | null> {
  try {
    const [acc] = await db
      .select({ id: account.id, accessToken: account.accessToken })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, GITHUB_PROVIDER_ID)))
      .limit(1);

    if (!acc?.accessToken) {
      return null;
    }

    const token = decryptSecret(acc.accessToken);

    if (!isSecretEnvelope(acc.accessToken)) {
      const encryptedToken = encryptSecret(token);
      await db
        .update(account)
        .set({ accessToken: encryptedToken, updatedAt: new Date() })
        .where(eq(account.id, acc.id))
        .catch((migrationError) => {
          logger.warn(
            { migrationError, userId },
            "GitHub token encryption migration failed (non-fatal)",
          );
        });
    }

    return token;
  } catch (err) {
    logger.error(ensureError(err), "getGithubToken database error");
    throw new Error("Failed to retrieve GitHub credentials");
  }
}
