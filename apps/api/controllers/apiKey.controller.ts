import type { Response } from 'express';
import { ZodError } from 'zod';
import { db, user, eq, session } from '@workspace/auth';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
  CreateApiKeyResponse,
  UpdateApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  ErrorResponse,
} from '../schemas/apiKey.schema.js';

const sendError = (res: Response, status: number, error: string): void => {
  res.status(status).json({
    error,
    timestamp: new Date().toISOString(),
  });
};

const sendValidationError = (res: Response, errors: ZodError): void => {
  res.status(400).json({
    error: 'Validation failed',
    details: errors.errors.map(e => ({
      path: e.path,
      message: e.message,
    })),
    timestamp: new Date().toISOString(),
  });
};

const getUserFromSession = async (sessionId: string) => {
  const [result] = await db
    .select({
      id: user.id,
      apiKey: user.apiKey,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(eq(session.id, sessionId))
    .limit(1);

  return result;
};

export const getApiKey = async (
  req: AuthenticatedRequest,
  res: Response<GetApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {

    if (!req.sessionId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const userData = await getUserFromSession(req.sessionId);

    if (!userData?.apiKey) {
      sendError(res, 404, 'API key not found');
      return;
    }

    res.status(200).json({
      message: 'API key retrieved successfully',
      data: {
        hasApiKey: true,
        userId: userData.id,
        apiKey: userData.apiKey,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('getApiKey error:', error);
    sendError(res, 500, 'Internal server error');
  }
};


export const createApiKey = async (
  req: AuthenticatedRequest,
  res: Response<CreateApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    if (!req.sessionId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const { body } = CreateApiKeyRequestSchema.parse(req);
    const userData = await getUserFromSession(req.sessionId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    if (userData.apiKey) {
      sendError(res, 409, 'API key already exists');
      return;
    }

    const [updatedUser] = await db
      .update(user)
      .set({ apiKey: body.apiKey })
      .where(eq(user.id, userData.id))
      .returning();

    res.status(201).json({
      message: 'API key created successfully',
      data: {
        apiKey: updatedUser.apiKey!,
        userId: updatedUser.id,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(res, error);
      return;
    }
    console.error('createApiKey error:', error);
    sendError(res, 500, 'Internal server error');
  }
};


export const updateApiKey = async (
  req: AuthenticatedRequest,
  res: Response<UpdateApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    if (!req.sessionId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const { body } = UpdateApiKeyRequestSchema.parse(req);
    const userData = await getUserFromSession(req.sessionId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    const [updatedUser] = await db
      .update(user)
      .set({
        apiKey: body.apiKey,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userData.id))
      .returning();

    res.status(200).json({
      message: 'API key updated successfully',
      data: {
        apiKey: updatedUser.apiKey!,
        userId: updatedUser.id,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(res, error);
      return;
    }
    console.error('updateApiKey error:', error);
    sendError(res, 500, 'Internal server error');
  }
};


export const deleteApiKey = async (
  req: AuthenticatedRequest,
  res: Response<DeleteApiKeyResponse | ErrorResponse>
): Promise<void> => {
  try {
    if (!req.sessionId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const userData = await getUserFromSession(req.sessionId);

    if (!userData) {
      sendError(res, 404, 'User not found');
      return;
    }

    await db
      .update(user)
      .set({ apiKey: null, updatedAt: new Date() })
      .where(eq(user.id, userData.id));

    res.status(200).json({
      message: 'API key deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('deleteApiKey error:', error);
    sendError(res, 500, 'Internal server error');
  }
};