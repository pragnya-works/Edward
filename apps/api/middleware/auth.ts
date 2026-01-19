import type { Request, Response, NextFunction } from 'express';
import { auth } from '@workspace/auth';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
      res.status(401).json({
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    req.userId = sessionData.user.id;
    req.sessionId = sessionData.session.id;
    next();
  } catch (error) {
    console.error('authMiddleware error:', error);
    res.status(401).json({
      error: 'Unauthorized',
      timestamp: new Date().toISOString(),
    });
  }
};

export const getAuthenticatedUserId = (req: AuthenticatedRequest): string => {
  if (!req.userId) {
    throw new Error("Context Error: req.userId is missing. Ensure 'authMiddleware' is applied to this route.");
  }
  return req.userId;
};