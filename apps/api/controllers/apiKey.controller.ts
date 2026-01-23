import type { Response } from 'express';
import { db, user, eq } from '@workspace/auth';
import { type AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/auth.js';
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
  CreateApiKeyResponse,
  UpdateApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  ErrorResponse,
} from '../schemas/apiKey.schema.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const sendError = (res: Response, status: number, error: string): void => {
  res.status(status).json({
    error,
    timestamp: new Date().toISOString(),
  });
};

const getUser = async (userId: string) => {
  const [result] = await db
    .select({
      id: user.id,
      apiKey: user.apiKey,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return result;
};

export const getApiKey = async (
  req: AuthenticatedRequest,
  res: Response<GetApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const userData = await getUser(userId);

    if (!userData?.apiKey) {
      logger.info(`[API Key] Access attempt - No key found for user: ${userId}`);
      res.status(200).json({
        message: 'No API key found',
        data: {
          hasApiKey: false,
          userId: userData?.id || userId,
          createdAt: userData?.createdAt,
          updatedAt: userData?.updatedAt,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let keyPreview: string | undefined;
    try {
      const decryptedKey = decrypt(userData.apiKey);
      keyPreview = `${decryptedKey.slice(0, 7)}...${decryptedKey.slice(-4)}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[API Key] Decryption failed for user ${userData.id}: ${errorMessage}`);
    }

    logger.info(`[API Key] Retrieved for user: ${userId}`);

    res.status(200).json({
      message: 'API key status retrieved successfully',
      data: {
        hasApiKey: true,
        keyPreview,
        userId: userData.id,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'getApiKey error');
    sendError(res, 500, 'Internal server error');
  }
};

export const createApiKey = async (
  req: AuthenticatedRequest,
  res: Response<CreateApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { body } = req as z.infer<typeof CreateApiKeyRequestSchema>;
    const userData = await getUser(userId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    if (userData.apiKey) {
      logger.warn(`[API Key] Creation attempt failed - Key already exists for user: ${userId}`);
      sendError(res, 409, 'API key already exists');
      return;
    }

    const encryptedApiKey = encrypt(body.apiKey);
    const [updatedUser] = await db
      .update(user)
      .set({ apiKey: encryptedApiKey })
      .where(eq(user.id, userData.id))
      .returning();

    logger.info(`[API Key] Created for user: ${userId}`);

    res.status(201).json({
      message: 'API key created successfully',
      data: {
        userId: updatedUser.id,
        keyPreview: `${body.apiKey.slice(0, 7)}...${body.apiKey.slice(-4)}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'createApiKey error');
    sendError(res, 500, 'Internal server error');
  }
};

export const updateApiKey = async (
  req: AuthenticatedRequest,
  res: Response<UpdateApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { body } = req as z.infer<typeof UpdateApiKeyRequestSchema>;
    const userData = await getUser(userId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    const encryptedApiKey = encrypt(body.apiKey);

    const [updatedUser] = await db
      .update(user)
      .set({
        apiKey: encryptedApiKey,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userData.id))
      .returning();

    logger.info(`[API Key] Updated for user: ${userId}`);

    res.status(200).json({
      message: 'API key updated successfully',
      data: {
        userId: updatedUser.id,
        keyPreview: `${body.apiKey.slice(0, 7)}...${body.apiKey.slice(-4)}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'updateApiKey error');
    sendError(res, 500, 'Internal server error');
  }
};

export const deleteApiKey = async (
  req: AuthenticatedRequest,
  res: Response<DeleteApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const userData = await getUser(userId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    await db
      .update(user)
      .set({ apiKey: null, updatedAt: new Date() })
      .where(eq(user.id, userData.id));

    logger.info(`[API Key] Deleted for user: ${userId}`);

    res.status(200).json({
      message: 'API key deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'deleteApiKey error');
    sendError(res, 500, 'Internal server error');
  }
};

export const useApiKeyForRequest = async (userId: string) => {
  const userData = await getUser(userId);
  if (!userData?.apiKey) {
    throw new Error('API key not found');
  }

  const decryptedApiKey = decrypt(userData.apiKey);
  return decryptedApiKey;
};