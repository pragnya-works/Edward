import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiKeyRouter } from './routes/apiKey.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { Environment, createLogger } from './utils/logger.js';
import { HttpStatus, HttpMethod, ERROR_MESSAGES } from './utils/constants.js';

const logger = createLogger('API');

const app = express();

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

app.get('/health', function healthCheck(_req: Request, res: Response) {
  res.status(HttpStatus.OK).json({
    status: 'ok',
    environment: env,
    timestamp: new Date().toISOString(),
  });
});

const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many API key requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api-key', apiKeyLimiter, authMiddleware, apiKeyRouter);
app.use('/chat', chatLimiter, authMiddleware, chatRouter);

app.use(function notFoundHandler(_req: Request, res: Response) {
  res.status(HttpStatus.NOT_FOUND).json({
    error: ERROR_MESSAGES.NOT_FOUND,
    timestamp: new Date().toISOString(),
  });
});

app.use(function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: isProd ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR : err.message,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, function onListen() {
  logger.info(`Server running on port ${PORT}`);
});

function shutdown() {
  logger.info('Shutting down server');
  server.close(function onClose() { process.exit(0); });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
