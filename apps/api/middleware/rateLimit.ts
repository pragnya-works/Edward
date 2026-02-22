import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { HttpStatus } from '../utils/constants.js';
import { sendError } from '../utils/response.js';
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

function createRateLimitExceededHandler(scope: string, message: string) {
  return (req: Request, res: Response): void => {
    logSecurityEvent('rate_limit_exceeded', {
      scope,
      path: req.originalUrl,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      userId: (req as AuthenticatedRequest).userId,
    });
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, message);
  };
}

export const apiKeyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  ...SHARED_RATE_LIMIT_OPTIONS,
  handler: createRateLimitExceededHandler(
    'api_key',
    'Too many requests. Please try again in 15 minutes.',
  ),
  store: createRedisStore('api-key'),
});

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  ...SHARED_RATE_LIMIT_OPTIONS,
  handler: createRateLimitExceededHandler(
    'chat_burst',
    'Chat burst limit reached. Please wait a minute.',
  ),
  store: createRedisStore('chat'),
});

export const dailyChatRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1000,
  ...SHARED_RATE_LIMIT_OPTIONS,
  keyGenerator: getAuthenticatedRateLimitKey,
  handler: createRateLimitExceededHandler(
    'chat_daily',
    'Daily message quota exceeded (1000 messages/24h)',
  ),
  store: createRedisStore('chat-daily'),
});

export const githubRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  ...SHARED_RATE_LIMIT_OPTIONS,
  keyGenerator: getAuthenticatedRateLimitKey,
  handler: createRateLimitExceededHandler(
    'github_burst',
    'GitHub request burst limit reached. Please wait a minute.',
  ),
  store: createRedisStore('github'),
});

export const dailyGithubRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 400,
  ...SHARED_RATE_LIMIT_OPTIONS,
  keyGenerator: getAuthenticatedRateLimitKey,
  handler: createRateLimitExceededHandler(
    'github_daily',
    'Daily GitHub quota exceeded (400 requests/24h).',
  ),
  store: createRedisStore('github-daily'),
});
