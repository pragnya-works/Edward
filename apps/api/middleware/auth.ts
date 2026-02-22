import type { Request, Response, NextFunction } from 'express';
import type { IncomingHttpHeaders } from "node:http";
import { auth } from '@edward/auth';
import { logger } from '../utils/logger.js';
import { HttpMethod, HttpStatus, ERROR_MESSAGES } from '../utils/constants.js';
import {
  getClientIp,
  getRequestId,
  logSecurityEvent,
} from './securityTelemetry.js';

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

function toFetchHeaders(headers: IncomingHttpHeaders): Headers {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      normalized.set(key, value.join(", "));
    }
  }
  return normalized;
}

function buildAuthTelemetryContext(req: AuthenticatedRequest): Record<string, unknown> {
  return {
    method: req.method,
    path: req.originalUrl,
    ip: getClientIp(req),
    requestId: getRequestId(req),
  };
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
      headers: toFetchHeaders(req.headers),
    });

    if (!sessionData?.session || !sessionData?.user) {
      logSecurityEvent('auth_unauthorized', buildAuthTelemetryContext(req));
      sendUnauthorized(res);
      return;
    }

    req.userId = sessionData.user.id;
    req.sessionId = sessionData.session.id;
    next();
  } catch (error) {
    logger.error(error, 'authMiddleware error');
    logSecurityEvent('auth_middleware_error', buildAuthTelemetryContext(req));
    sendUnauthorized(res);
  }
}

export function getAuthenticatedUserId(req: AuthenticatedRequest): string {
  if (!req.userId) {
    throw new Error("Context Error: req.userId is missing. Ensure 'authMiddleware' is applied to this route.");
  }
  return req.userId;
}
