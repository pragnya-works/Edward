import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { initSandboxService, shutdownSandboxService } from './services/sandbox/lifecycle.sandbox.js';
import { redis } from './lib/redis.js';
import { apiKeyRouter } from './routes/apiKey.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth.js';

import { Environment, createLogger } from './utils/logger.js';
import { HttpStatus, HttpMethod, ERROR_MESSAGES } from './utils/constants.js';
import { ensureError } from './utils/error.js';
import { sendError } from './utils/response.js';

const PORT = Number(process.env.EDWARD_API_PORT) || 3001;
const ENV = (process.env.NODE_ENV as Environment) || Environment.Development;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = Number(process.env.REDIS_PORT);

if (!REDIS_HOST || isNaN(REDIS_PORT)) {
  throw new Error('Missing critical Redis configuration (REDIS_HOST or REDIS_PORT)');
}

const isDev = ENV === Environment.Development;
const isProd = ENV === Environment.Production;

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [];

const logger = createLogger('API');
const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    }
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));

if (isProd) {
  app.use(function forceHttpsMiddleware(req: Request, res: Response, next: NextFunction) {
    const isSecure = req.header('x-forwarded-proto') === 'https';
    if (!isSecure) {
      const httpsUrl = `https://${req.header('host')}${req.url}`;
      return res.redirect(HttpStatus.MOVED_PERMANENTLY, httpsUrl);
    }
    next();
  });
}

app.use(cors({
  origin: function checkOrigin(origin, callback) {
    if (isDev || !origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.PATCH],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (!isProd) {
  app.use(function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    const startTimeTime = Date.now();

    res.on('finish', function logResponse() {
      const durationMs = Date.now() - startTimeTime;
      logger.info(
        `${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${durationMs}ms`
      );
    });

    next();
  });
}

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

const apiKeyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Too many requests. Please try again in 15 minutes.');
  },
  store: new RedisStore(sharedRedisRateLimitConfig('api-key')),
});

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Chat burst limit reached. Please wait a minute.');
  },
  store: new RedisStore(sharedRedisRateLimitConfig('chat')),
});

const dailyChatRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
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

app.use('/api-key', apiKeyRateLimiter, authMiddleware, apiKeyRouter);
app.use('/chat', chatRateLimiter, authMiddleware, dailyChatRateLimiter, chatRouter);

app.get('/health', function healthCheckRoute(_req: Request, res: Response) {
  res.status(HttpStatus.OK).json({
    status: 'ok',
    environment: ENV,
    timestamp: new Date().toISOString(),
  });
});

app.use(function routeNotFoundHandler(_req: Request, res: Response) {
  res.status(HttpStatus.NOT_FOUND).json({
    error: ERROR_MESSAGES.NOT_FOUND,
    timestamp: new Date().toISOString(),
  });
});

app.use(function globalErrorHandler(err: unknown, _req: Request, res: Response) {
  const error = ensureError(err);
  logger.error(error);

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: isProd ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR : error.message,
    timestamp: new Date().toISOString(),
  });
});

const serverInstance = app.listen(PORT, async function onServerStarted() {
  logger.info(`Edward API Server listening on port ${PORT} [Mode: ${ENV}]`);

  try {
    await initSandboxService();
    logger.info('Sandbox Service initialized.');
  } catch (err) {
    logger.error(ensureError(err), 'Failed during startup');
    process.exit(1);
  }
});

let isShuttingDown = false;

async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting cleanup...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout reached. Forcing exit.');
    process.exit(1);
  }, 15000);

  serverInstance.close(async function onServerClosed() {
    try {
      await Promise.all([
        shutdownSandboxService(),
        redis.quit(),
      ]);

      logger.info('Graceful shutdown successful.');
      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch (err) {
      logger.error(ensureError(err), 'Error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught Exception');
  handleGracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Rejection');
  handleGracefulShutdown('unhandledRejection');
});
