import type { Response } from "express";
import { db, user, eq } from "@edward/auth";
import {
  getDefaultModel,
  getProviderFromKey,
  getProviderFromModel,
} from "@edward/shared/schema";
import {
  type AuthenticatedRequest,
  getAuthenticatedUserId,
} from "../middleware/auth.js";
import {
  CreateApiKeyResponse,
  UpdateApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  ErrorResponse,
} from "../schemas/apiKey.schema.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";
import { getUserWithApiKey } from "../services/apiKey.service.js";
import { sendError, sendSuccess } from "../utils/response.js";
import { HttpStatus } from "../utils/constants.js";
import { asyncHandler } from "../utils/controller.js";

function formatKeyPreview(apiKey: string): string {
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

function getProviderFromEncryptedKey(
  encryptedApiKey: string | null,
): ReturnType<typeof getProviderFromKey> {
  if (!encryptedApiKey) return null;
  try {
    const decryptedKey = decrypt(encryptedApiKey);
    return getProviderFromKey(decryptedKey);
  } catch {
    return null;
  }
}

async function getApiKeyHandler(
  req: AuthenticatedRequest,
  res: Response<GetApiKeyResponse | ErrorResponse>,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const userData = await getUserWithApiKey(userId);

  if (!userData?.apiKey) {
    sendSuccess(res, HttpStatus.OK, "No API key found", {
      hasApiKey: false,
      userId: userData?.id || userId,
      preferredModel: userData?.preferredModel,
      createdAt: userData?.createdAt,
      updatedAt: userData?.updatedAt,
    });
    return;
  }

  let keyPreview: string | undefined;
  try {
    const decryptedKey = decrypt(userData.apiKey);
    keyPreview = formatKeyPreview(decryptedKey);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[API Key] Decryption failed for user ${userData.id}: ${errorMessage}`,
    );
  }
  sendSuccess(res, HttpStatus.OK, "API key status retrieved successfully", {
    hasApiKey: true,
    keyPreview,
    preferredModel: userData.preferredModel,
    userId: userData.id,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt,
  });
}

async function createApiKeyHandler(
  req: AuthenticatedRequest,
  res: Response<CreateApiKeyResponse | ErrorResponse>,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { apiKey } = req.body;
  const userData = await getUserWithApiKey(userId);

  if (!userData) {
    sendError(res, HttpStatus.NOT_FOUND, "User not found");
    return;
  }

  if (userData.apiKey) {
    logger.warn(
      `[API Key] Creation attempt failed - Key already exists for user: ${userId}`,
    );
    sendError(res, HttpStatus.CONFLICT, "API key already exists");
    return;
  }

  const keyProvider = getProviderFromKey(apiKey);
  const modelToSet = req.body.model || (keyProvider ? getDefaultModel(keyProvider) : undefined);
  const modelProvider = modelToSet ? getProviderFromModel(modelToSet) : null;

  if (keyProvider && modelProvider && keyProvider !== modelProvider) {
    sendError(
      res,
      HttpStatus.BAD_REQUEST,
      "Selected model is incompatible with the provided API key",
    );
    return;
  }

  const encryptedApiKey = encrypt(apiKey);
  const [updatedUser] = await db
    .update(user)
    .set({
      apiKey: encryptedApiKey,
      preferredModel: modelToSet,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userData.id))
    .returning();

  if (!updatedUser) {
    sendError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create API key",
    );
    return;
  }

  sendSuccess(res, HttpStatus.CREATED, "API key created successfully", {
    userId: updatedUser.id,
    keyPreview: formatKeyPreview(apiKey),
    preferredModel: updatedUser.preferredModel,
  });
}

async function updateApiKeyHandler(
  req: AuthenticatedRequest,
  res: Response<UpdateApiKeyResponse | ErrorResponse>,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const { apiKey } = req.body;
  const userData = await getUserWithApiKey(userId);

  if (!userData) {
    sendError(res, HttpStatus.NOT_FOUND, "User not found");
    return;
  }

  const incomingApiKey =
    typeof apiKey === "string" && apiKey.trim().length > 0
      ? apiKey.trim()
      : undefined;
  const currentKeyProvider = getProviderFromEncryptedKey(userData.apiKey);
  const targetKeyProvider = incomingApiKey
    ? getProviderFromKey(incomingApiKey)
    : currentKeyProvider;

  let modelToSet = req.body.model || userData.preferredModel;
  if (!req.body.model && targetKeyProvider) {
    const currentModelProvider = modelToSet
      ? getProviderFromModel(modelToSet)
      : null;
    if (!modelToSet || (currentModelProvider && currentModelProvider !== targetKeyProvider)) {
      modelToSet = getDefaultModel(targetKeyProvider);
    }
  }

  const modelProvider = modelToSet ? getProviderFromModel(modelToSet) : null;
  if (targetKeyProvider && modelProvider && targetKeyProvider !== modelProvider) {
    sendError(
      res,
      HttpStatus.BAD_REQUEST,
      "Selected model is incompatible with the provided API key",
    );
    return;
  }

  const encryptedApiKey = incomingApiKey
    ? encrypt(incomingApiKey)
    : userData.apiKey;

  if (!encryptedApiKey) {
    sendError(
      res,
      HttpStatus.BAD_REQUEST,
      "API key is required before selecting a model",
    );
    return;
  }

  const [updatedUser] = await db
    .update(user)
    .set({
      apiKey: encryptedApiKey,
      preferredModel: modelToSet,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userData.id))
    .returning();

  if (!updatedUser) {
    sendError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update API key",
    );
    return;
  }

  let keyPreview = "Existing Key";
  if (incomingApiKey) {
    keyPreview = formatKeyPreview(incomingApiKey);
  } else if (userData.apiKey) {
    try {
      keyPreview = formatKeyPreview(decrypt(userData.apiKey));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.warn(
        `[API Key] Failed to decrypt existing key during update for user ${userId}: ${errorMessage}`,
      );
    }
  }

  sendSuccess(res, HttpStatus.OK, "API key updated successfully", {
    userId: updatedUser.id,
    keyPreview,
    preferredModel: updatedUser.preferredModel,
  });
}

async function deleteApiKeyHandler(
  req: AuthenticatedRequest,
  res: Response<DeleteApiKeyResponse | ErrorResponse>,
): Promise<void> {
  const userId = getAuthenticatedUserId(req);
  const userData = await getUserWithApiKey(userId);

  if (!userData) {
    sendError(res, HttpStatus.NOT_FOUND, "User not found");
    return;
  }

  await db
    .update(user)
    .set({ apiKey: null, updatedAt: new Date() })
    .where(eq(user.id, userData.id));

  sendSuccess(res, HttpStatus.OK, "API key deleted successfully");
}

export const getApiKey = asyncHandler(getApiKeyHandler);
export const createApiKey = asyncHandler(createApiKeyHandler);
export const updateApiKey = asyncHandler(updateApiKeyHandler);
export const deleteApiKey = asyncHandler(deleteApiKeyHandler);
