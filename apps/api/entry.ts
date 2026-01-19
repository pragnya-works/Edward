import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createApiKeyRouter } from './routes/apiKey.routes.js';
import { createChatRouter } from './routes/chat.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { Environment, logger } from '@workspace/logger';

const app = express();

const PORT = Number(process.env.EDWARD_API_PORT);
if (!PORT) {
  throw new Error('EDWARD_API_PORT is not defined');
}

const env = (process.env.NODE_ENV as Environment) || Environment.Development;
const isDev = env === Environment.Development;
const isProd = env === Environment.Production;

const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: CORS_ORIGINS.length ? CORS_ORIGINS : isDev,
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!isProd) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: env,
    timestamp: new Date().toISOString(),
  });
});

app.use(authMiddleware);
app.use('/api-key', createApiKeyRouter());
app.use('/chat', createChatRouter());

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({
    error: isProd ? 'Internal Server Error' : err.message,
  });
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

const shutdown = () => {
  logger.info('Shutting down server');
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
