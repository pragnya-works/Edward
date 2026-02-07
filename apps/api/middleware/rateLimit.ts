import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { sendError } from '../utils/response.js';
import { HttpStatus } from '../utils/constants.js';
import { AuthenticatedRequest } from './auth.js';

function sharedRedisRateLimitConfig(prefix: string) {
    return {
        sendCommand: async (...args: string[]) => {
            const redisCommand = args[0];
            if (!redisCommand) throw new Error('Redis command is missing');
            return (await redis.call(redisCommand, ...args.slice(1))) as string | number | boolean;
        },
        prefix: `rl:${prefix}:`,
    };
}

export const apiKeyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Too many requests. Please try again in 15 minutes.');
    },
    store: new RedisStore(sharedRedisRateLimitConfig('api-key')),
});

export const chatRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Chat burst limit reached. Please wait a minute.');
    },
    store: new RedisStore(sharedRedisRateLimitConfig('chat')),
});

export const dailyChatRateLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const userId = (req as AuthenticatedRequest).userId;
        if (userId) return userId;
        return ipKeyGenerator(req.ip || 'anonymous');
    },
    handler: (_req, res) => {
        sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Daily message quota exceeded (10 messages/24h)');
    },
    store: new RedisStore(sharedRedisRateLimitConfig('chat-daily')),
});
