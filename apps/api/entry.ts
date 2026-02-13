import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import "./utils/sentry.js";
import { Sentry } from "./utils/sentry.js";
import {
  initSandboxService,
  shutdownSandboxService,
} from "./services/sandbox/lifecycle/control.js";
import { redis } from "./lib/redis.js";
import { apiKeyRouter } from "./routes/apiKey.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { githubRouter } from "./routes/github.routes.js";
import { authMiddleware } from "./middleware/auth.js";
import { apiKeyRateLimiter } from "./middleware/rateLimit.js";
import { Environment, createLogger } from "./utils/logger.js";
import {
  HttpStatus,
  HttpMethod,
  ERROR_MESSAGES,
  VERSION,
} from "./utils/constants.js";
import { ensureError } from "./utils/error.js";
import { config } from "./config.js";

const PORT = config.server.port;
const ENV = config.server.environment as Environment;
const isDev = config.server.isDevelopment();
const isProd = config.server.isProduction();
const ALLOWED_ORIGINS = config.cors.origins;

const logger = createLogger("API");
const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"],
      },
    },
    frameguard: { action: "deny" },
    noSniff: true,
    xssFilter: true,
  }),
);

if (isProd) {
  app.use(function forceHttpsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const isSecure = req.header("x-forwarded-proto") === "https";
    if (!isSecure) {
      const httpsUrl = `https://${req.header("host")}${req.url}`;
      return res.redirect(HttpStatus.MOVED_PERMANENTLY, httpsUrl);
    }
    next();
  });
}

app.use(
  cors({
    origin: function checkOrigin(origin, callback) {
      if (isDev || !origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: [
      HttpMethod.GET,
      HttpMethod.POST,
      HttpMethod.PUT,
      HttpMethod.DELETE,
      HttpMethod.PATCH,
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (!isProd) {
  app.use(function requestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const startTime = Date.now();

    res.on("finish", function logResponse() {
      const durationMs = Date.now() - startTime;
      logger.info(
        `${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${durationMs}ms`,
      );
    });

    next();
  });
}

app.use("/api-key", apiKeyRateLimiter, authMiddleware, apiKeyRouter);
app.use("/chat", authMiddleware, chatRouter);
app.use("/github", authMiddleware, githubRouter);

app.get("/health", function healthCheckRoute(_req: Request, res: Response) {
  res.status(HttpStatus.OK).json({
    status: "ok",
    version: VERSION,
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

app.use(function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  void _next;
  const error = ensureError(err);
  logger.error(error);
  Sentry.captureException(error);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: isProd ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR : error.message,
    timestamp: new Date().toISOString(),
  });
});

const serverInstance = app.listen(PORT, async function onServerStarted() {
  logger.info(
    `Edward API v${VERSION} listening on port ${PORT} [Mode: ${ENV}]`,
  );

  try {
    await initSandboxService();
    logger.info("Sandbox Service initialized.");
  } catch (err) {
    logger.error(ensureError(err), "Failed during startup");
    process.exit(1);
  }
});

let isShuttingDown = false;

async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting cleanup...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error("Shutdown timeout reached. Forcing exit.");
    process.exit(1);
  }, 15000);

  serverInstance.close(async function onServerClosed() {
    try {
      await Promise.all([shutdownSandboxService(), redis.quit()]);

      logger.info("Graceful shutdown successful.");
      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch (err) {
      logger.error(ensureError(err), "Error during shutdown");
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  logger.fatal(error, "Uncaught Exception");
  Sentry.captureException(error);
  handleGracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled Rejection");
  Sentry.captureException(reason);
  handleGracefulShutdown("unhandledRejection");
});
