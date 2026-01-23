import type { Response } from 'express';
import { db, user, eq } from '@workspace/auth';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
  ApiKeySchema,
  CreateApiKeyResponse,
  UpdateApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  ErrorResponse,
} from '../schemas/apiKey.schema.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { getUserWithApiKey } from '../services/apiKey.service.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { HttpStatus } from '../utils/constants.js';

function formatKeyPreview(apiKey: string): string {
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

export async function getApiKey(
  req: AuthenticatedRequest,
  res: Response<GetApiKeyResponse | ErrorResponse>
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const userData = await getUserWithApiKey(userId);

    if (!userData?.apiKey) {
      logger.info(`[API Key] Access attempt - No key found for user: ${userId}`);
      sendSuccess(res, HttpStatus.OK, 'No API key found', {
        hasApiKey: false,
        userId: userData?.id || userId,
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[API Key] Decryption failed for user ${userData.id}: ${errorMessage}`);
    }

    logger.info(`[API Key] Retrieved for user: ${userId}`);

    sendSuccess(res, HttpStatus.OK, 'API key status retrieved successfully', {
      hasApiKey: true,
      keyPreview,
      userId: userData.id,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    });
  } catch (error) {
    logger.error(error, 'getApiKey error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function createApiKey(
  req: AuthenticatedRequest,
  res: Response<CreateApiKeyResponse | ErrorResponse>
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const validated = ApiKeySchema.safeParse(req.body);

    if (!validated.success) {
      sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || 'Validation failed');
      return;
    }

    const { apiKey } = validated.data;
    const userData = await getUserWithApiKey(userId);

    if (!userData) {
      sendError(res, HttpStatus.NOT_FOUND, 'User not found');
      return;
    }

    if (userData.apiKey) {
      logger.warn(`[API Key] Creation attempt failed - Key already exists for user: ${userId}`);
      sendError(res, HttpStatus.CONFLICT, 'API key already exists');
      return;
    }

    const encryptedApiKey = encrypt(apiKey);
    const [updatedUser] = await db
      .update(user)
      .set({ apiKey: encryptedApiKey, updatedAt: new Date() })
      .where(eq(user.id, userData.id))
      .returning();

    logger.info(`[API Key] Created for user: ${userId}`);

    sendSuccess(res, HttpStatus.CREATED, 'API key created successfully', {
      userId: updatedUser.id,
      keyPreview: formatKeyPreview(apiKey),
    });
  } catch (error) {
    logger.error(error, 'createApiKey error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function updateApiKey(
  req: AuthenticatedRequest,
  res: Response<UpdateApiKeyResponse | ErrorResponse>
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const validated = ApiKeySchema.safeParse(req.body);

    if (!validated.success) {
      sendError(res, HttpStatus.BAD_REQUEST, validated.error.errors[0]?.message || 'Validation failed');
      return;
    }

    const { apiKey } = validated.data;
    const userData = await getUserWithApiKey(userId);

    if (!userData) {
      sendError(res, HttpStatus.NOT_FOUND, 'User not found');
      return;
    }

    const encryptedApiKey = encrypt(apiKey);

    const [updatedUser] = await db
      .update(user)
      .set({
        apiKey: encryptedApiKey,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userData.id))
      .returning();

    logger.info(`[API Key] Updated for user: ${userId}`);

    sendSuccess(res, HttpStatus.OK, 'API key updated successfully', {
      userId: updatedUser.id,
      keyPreview: formatKeyPreview(apiKey),
    });
  } catch (error) {
    logger.error(error, 'updateApiKey error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function deleteApiKey(
  req: AuthenticatedRequest,
  res: Response<DeleteApiKeyResponse | ErrorResponse>
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const userData = await getUserWithApiKey(userId);

    if (!userData) {
      sendError(res, HttpStatus.NOT_FOUND, 'User not found');
      return;
    }

    await db
      .update(user)
      .set({ apiKey: null, updatedAt: new Date() })
      .where(eq(user.id, userData.id));

    logger.info(`[API Key] Deleted for user: ${userId}`);

    sendSuccess(res, HttpStatus.OK, 'API key deleted successfully');
  } catch (error) {
    logger.error(error, 'deleteApiKey error');
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}