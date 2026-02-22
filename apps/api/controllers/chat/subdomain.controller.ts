import type { Response } from "express";
import { db, chat, eq, build, desc } from "@edward/auth";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import {
  checkSubdomainAvailability,
  registerPreviewSubdomain,
  deletePreviewSubdomain,
  generatePreviewSubdomain,
} from "../../services/previewRouting.service.js";
import { buildSubdomainPreviewUrl } from "../../services/preview.service.js";
import { buildS3Key } from "../../services/storage/key.utils.js";
import { getChatIdOrRespond } from "./shared.utils.js";
import {
  CheckSubdomainQuerySchema,
  UpdateSubdomainBodySchema,
} from "../../schemas/chat.schema.js";
import { config, DEPLOYMENT_TYPES } from "../../config.js";

export async function checkSubdomainAvailabilityHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const parsed = CheckSubdomainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, HttpStatus.BAD_REQUEST, parsed.error.errors[0]?.message ?? "Invalid query");
      return;
    }

    const { subdomain, chatId } = parsed.data;
    const [chatData] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);
    if (!chatData) {
      sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }
    if (chatData.userId !== userId) {
      sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    const storagePrefix = buildS3Key(userId, chatId).replace(/\/$/, "");
    const result = await checkSubdomainAvailability(
      subdomain,
      chatId,
      storagePrefix,
    );

    sendSuccess(res, HttpStatus.OK, "Availability checked", {
      subdomain,
      available: result.available,
      reason: result.reason,
    });
  } catch (error) {
    logger.error(ensureError(error), "checkSubdomainAvailability error");
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}

export async function updateChatSubdomainHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = getChatIdOrRespond(req.params.chatId, res, sendError);
    if (!chatId) return;

    const parsed = UpdateSubdomainBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, HttpStatus.BAD_REQUEST, parsed.error.errors[0]?.message ?? "Invalid body");
      return;
    }

    const { subdomain: newSubdomain } = parsed.data;

    const [chatData] = await db
      .select({ userId: chat.userId, customSubdomain: chat.customSubdomain })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatData) {
      sendError(res, HttpStatus.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      return;
    }
    if (chatData.userId !== userId) {
      sendError(res, HttpStatus.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    if (config.deployment.type !== DEPLOYMENT_TYPES.SUBDOMAIN) {
      sendError(res, HttpStatus.BAD_REQUEST, "Custom subdomains require subdomain routing to be enabled.");
      return;
    }

    const storagePrefix = buildS3Key(userId, chatId).replace(/\/$/, "");
    const availabilityResult = await checkSubdomainAvailability(
      newSubdomain,
      chatId,
      storagePrefix,
    );
    if (!availabilityResult.available) {
      sendError(res, HttpStatus.CONFLICT, availabilityResult.reason ?? "Subdomain is unavailable");
      return;
    }

    const previousCustomSubdomain = chatData.customSubdomain ?? null;
    const oldSubdomain =
      previousCustomSubdomain ?? generatePreviewSubdomain(userId, chatId);
    const subdomainChanged = oldSubdomain !== newSubdomain;
    const newPreviewUrl = buildSubdomainPreviewUrl(newSubdomain);
    const previousPreviewUrl = buildSubdomainPreviewUrl(oldSubdomain);

    await db.transaction(async (tx) => {
      await tx
        .update(chat)
        .set({ customSubdomain: newSubdomain, updatedAt: new Date() })
        .where(eq(chat.id, chatId));

      const latestBuild = await tx.query.build.findFirst({
        where: eq(build.chatId, chatId),
        orderBy: [desc(build.createdAt)],
      });

      if (!latestBuild) {
        return;
      }

      await tx
        .update(build)
        .set({ previewUrl: newPreviewUrl, updatedAt: new Date() })
        .where(eq(build.id, latestBuild.id));
    });

    let routing: Awaited<ReturnType<typeof registerPreviewSubdomain>> = null;
    try {
      routing = await registerPreviewSubdomain(userId, chatId, newSubdomain);
      if (!routing) {
        throw new Error("Subdomain routing is not configured on this server.");
      }
    } catch (registrationError) {
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(chat)
            .set({ customSubdomain: previousCustomSubdomain, updatedAt: new Date() })
            .where(eq(chat.id, chatId));

          const latestBuild = await tx.query.build.findFirst({
            where: eq(build.chatId, chatId),
            orderBy: [desc(build.createdAt)],
          });

          if (!latestBuild) {
            return;
          }

          await tx
            .update(build)
            .set({ previewUrl: previousPreviewUrl, updatedAt: new Date() })
            .where(eq(build.id, latestBuild.id));
        });
      } catch (rollbackError) {
        logger.error(
          {
            chatId,
            userId,
            newSubdomain,
            previousCustomSubdomain,
            rollbackError: ensureError(rollbackError),
          },
          "Failed to rollback subdomain DB updates after routing registration failure",
        );
      }

      throw registrationError;
    }

    if (subdomainChanged) {
      await deletePreviewSubdomain(oldSubdomain, storagePrefix);
    }

    logger.info({ chatId, userId, oldSubdomain, newSubdomain }, "Custom subdomain updated");

    sendSuccess(res, HttpStatus.OK, "Subdomain updated successfully", {
      subdomain: newSubdomain,
      previewUrl: routing.previewUrl,
    });
  } catch (error) {
    const err = ensureError(error);
    if ((err as { code?: string }).code === "23505") {
      sendError(res, HttpStatus.CONFLICT, "This subdomain was just taken. Please try another.");
      return;
    }
    logger.error(err, "updateChatSubdomain error");
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}
