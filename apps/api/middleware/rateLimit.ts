import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  RATE_LIMIT_POLICY_BY_SCOPE,
  RATE_LIMIT_SCOPE,
  type KnownRateLimitScope,
  type RateLimitPolicy,
} from '@edward/shared/constants';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import {
  getDailyChatSuccessSnapshot,
} from '../services/rateLimit/chatDailySuccess.service.js';
import { HttpStatus } from '../utils/constants.js';
import { sendError } from '../utils/response.js';
import { ensureError } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from './auth.js';
import {
  getClientIp,
  getRequestId,
  logSecurityEvent,
} from './securityTelemetry.js';

const SHARED_RATE_LIMIT_OPTIONS = {
  standardHeaders: true,
  legacyHeaders: false,
} as const;

function sharedRedisRateLimitConfig(prefix: string) {
  return {
    sendCommand: async (...args: string[]) => {
      const redisCommand = args[0];
      if (!redisCommand) {
        throw new Error('Redis command is missing');
      }

      return (await redis.call(redisCommand, ...args.slice(1))) as
        | string
        | number
        | boolean;
    },
    prefix: `rl:${prefix}:`,
  };
}

function createRedisStore(prefix: string): RedisStore {
  return new RedisStore(sharedRedisRateLimitConfig(prefix));
}

function getAuthenticatedRateLimitKey(req: Request): string {
  const userId = (req as AuthenticatedRequest).userId;
  if (userId) {
    return userId;
  }
  return ipKeyGenerator(req.ip || 'anonymous');
}

function createRateLimitExceededHandler(
  scope: KnownRateLimitScope,
  policy: RateLimitPolicy,
) {
  return (req: Request, res: Response): void => {
    res.setHeader('RateLimit-Scope', scope);
    logSecurityEvent('rate_limit_exceeded', {
      scope: policy.securityScope,
      path: req.originalUrl,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      userId: (req as AuthenticatedRequest).userId,
    });
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, policy.limitExceededMessage);
  };
}

function createRateLimiterForScope(
  scope: KnownRateLimitScope,
  options: {
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request, res: Response) => boolean;
  } = {},
) {
  // Intentionally weaken RATE_LIMIT_POLICY_BY_SCOPE to Partial<Record<KnownRateLimitScope, RateLimitPolicy>>
  // so monorepo dist/source drift in @edward/shared can be caught by the runtime !policy guard below.
  const policy = (
    RATE_LIMIT_POLICY_BY_SCOPE as Partial<
      Record<KnownRateLimitScope, RateLimitPolicy>
    >
  )[scope];

  if (!policy) {
    throw new Error(
      `Missing rate-limit policy for scope "${String(scope)}". Rebuild @edward/shared so exported dist constants match source.`,
    );
  }

  return rateLimit({
    windowMs: policy.windowMs,
    max: policy.max,
    ...SHARED_RATE_LIMIT_OPTIONS,
    ...options,
    handler: createRateLimitExceededHandler(scope, policy),
    store: createRedisStore(policy.redisPrefix),
  });
}

export const apiKeyRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.API_KEY,
  {
    keyGenerator: getAuthenticatedRateLimitKey,
    skip: (req) => {
      const method = req.method.toUpperCase();
      return (
        method === 'GET' ||
        method === 'HEAD' ||
        method === 'OPTIONS'
      );
    },
  },
);

export const chatRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.CHAT_BURST,
  { keyGenerator: getAuthenticatedRateLimitKey },
);

const dailyChatPolicy = RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.CHAT_DAILY];

function setDailyChatHeaders(
  res: Response,
  snapshot: {
    limit: number;
    remaining: number;
    resetAtMs: number;
  },
): void {
  const now = Date.now();
  const resetInSeconds = Math.max(
    Math.ceil((snapshot.resetAtMs - now) / 1000),
    0,
  );
  res.setHeader('RateLimit-Limit', String(snapshot.limit));
  res.setHeader('RateLimit-Remaining', String(snapshot.remaining));
  res.setHeader('RateLimit-Reset', String(resetInSeconds));
  res.setHeader('RateLimit-Scope', RATE_LIMIT_SCOPE.CHAT_DAILY);
}

export async function dailyChatRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = getAuthenticatedRateLimitKey(req);

  try {
    const snapshot = await getDailyChatSuccessSnapshot(key);
    setDailyChatHeaders(res, snapshot);

    if (!snapshot.isLimited) {
      next();
      return;
    }

    logSecurityEvent('rate_limit_exceeded', {
      scope: dailyChatPolicy.securityScope,
      path: req.originalUrl,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      userId: (req as AuthenticatedRequest).userId,
    });
    sendError(
      res,
      HttpStatus.TOO_MANY_REQUESTS,
      dailyChatPolicy.limitExceededMessage,
    );
  } catch (error) {
    logger.error(
      {
        error: ensureError(error),
        userId: (req as AuthenticatedRequest).userId ?? null,
        path: req.originalUrl,
      },
      'Daily chat rate-limit gate failed; allowing request',
    );
    next();
  }
}

export const imageUploadRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.IMAGE_UPLOAD_BURST,
  { keyGenerator: getAuthenticatedRateLimitKey },
);

export const githubRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.GITHUB_BURST,
  { keyGenerator: getAuthenticatedRateLimitKey },
);

export const dailyGithubRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.GITHUB_DAILY,
  { keyGenerator: getAuthenticatedRateLimitKey },
);

export const promptEnhanceRateLimiter = createRateLimiterForScope(
  RATE_LIMIT_SCOPE.PROMPT_ENHANCE_BURST,
  { keyGenerator: getAuthenticatedRateLimitKey },
);
