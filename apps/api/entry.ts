import 'dotenv/config';
import { initSandboxService, shutdownSandboxService } from './services/sandbox.service.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './lib/redis.js';
import { apiKeyRouter } from './routes/apiKey.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { Environment, createLogger } from './utils/logger.js';
import { HttpStatus, HttpMethod, ERROR_MESSAGES } from './utils/constants.js';
import { ensureError } from './utils/error.js';
import { sendError } from './utils/response.js';

const logger = createLogger('API');

const app = express();

app.set('trust proxy', 1);

const PORT = Number(process.env.EDWARD_API_PORT);
if (!PORT) {
  throw new Error('EDWARD_API_PORT is not defined');
}

const env = (process.env.NODE_ENV as Environment) || Environment.Development;
const isDev = env === Environment.Development;
const isProd = env === Environment.Production;

const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(function trim(o) { return o.trim(); })
  : [];

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
  app.use(function forceHttps(req: Request, res: Response, next: NextFunction) {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(301, `https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

app.use(cors({
  origin: function checkOrigin(origin, callback) {
    if (isDev) {
      callback(null, true);
    } else {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
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
  app.use(function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', function logRequest() {
      logger.info(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });
}

const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Too many API key requests, please try again in 15 minutes');
  },
  store: new RedisStore({
    sendCommand: async (...args: string[]) => {
      const command = args[0];
      if (!command) throw new Error('Redis command is missing');
      return (await redis.call(command, ...args.slice(1))) as string | number | boolean;
    },
    prefix: 'rl:api-key:',
  }),
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, HttpStatus.TOO_MANY_REQUESTS, 'Chat burst limit reached. Please wait a minute.');
  },
  store: new RedisStore({
    sendCommand: async (...args: string[]) => {
      const command = args[0];
      if (!command) throw new Error('Redis command is missing');
      return (await redis.call(command, ...args.slice(1))) as string | number | boolean;
    },
    prefix: 'rl:chat:',
  }),
});

app.use('/api-key', apiKeyLimiter, authMiddleware, apiKeyRouter);
app.use('/chat', chatLimiter, authMiddleware, chatRouter);

app.get('/health', function healthCheck(_req: Request, res: Response) {
  res.status(HttpStatus.OK).json({
    status: 'ok',
    environment: env,
    timestamp: new Date().toISOString(),
  });
});

app.use(function notFoundHandler(_req: Request, res: Response) {
  res.status(HttpStatus.NOT_FOUND).json({
    error: ERROR_MESSAGES.NOT_FOUND,
    timestamp: new Date().toISOString(),
  });
});

app.use(function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const error = ensureError(err);
  logger.error(error);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: isProd ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR : error.message,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, async function onListen() {
  logger.info(`Server running on port ${PORT}`);
  try {
    await initSandboxService();
  } catch (err) {
    logger.error(ensureError(err), "Failed to initialize sandbox service");
    process.exit(1);
  }
});

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async function onClose() {
    logger.info("HTTP server closed.");
    
    try {
      await shutdownSandboxService();
      logger.info("Sandbox service cleaned up.");
      
      await redis.quit();
      logger.info("Redis connection closed.");
      
      process.exit(0);
    } catch (err) {
      logger.error(ensureError(err), "Error during shutdown cleanup");
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught Exception');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Rejection');
  shutdown('unhandledRejection');
});
