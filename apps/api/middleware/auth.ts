import type { Request, Response, NextFunction } from 'express';
import { auth } from '@workspace/auth';
import { logger } from '../utils/logger.js';
import { HttpMethod, HttpStatus, ERROR_MESSAGES } from '../utils/constants.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

function sendUnauthorized(res: Response): void {
  res.status(HttpStatus.UNAUTHORIZED).json({
    error: ERROR_MESSAGES.UNAUTHORIZED,
    timestamp: new Date().toISOString(),
  });
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.method === HttpMethod.OPTIONS) {
      next();
      return;
    }

    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
      sendUnauthorized(res);
      return;
    }

    req.userId = sessionData.user.id;
    req.sessionId = sessionData.session.id;
    next();
  } catch (error) {
    logger.error(error, 'authMiddleware error');
    sendUnauthorized(res);
  }
}

export function getAuthenticatedUserId(req: AuthenticatedRequest): string {
  if (!req.userId) {
    throw new Error("Context Error: req.userId is missing. Ensure 'authMiddleware' is applied to this route.");
  }
  return req.userId;
}