import express, { NextFunction, Request, Response } from "express";
import { db, user } from "@edward/auth";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { captureException } from "../../utils/sentry.js";
import { apiKeyRouter } from "../../routes/apiKey.routes.js";
import { chatRouter } from "../../routes/chat.routes.js";
import { githubRouter } from "../../routes/github.routes.js";
import { authMiddleware } from "../../middleware/auth.js";
import { apiKeyRateLimiter } from "../../middleware/rateLimit.js";
import { securityTelemetryMiddleware } from "../../middleware/securityTelemetry.js";
import type { Environment } from "../../utils/logger.js";
import { createLogger } from "../../utils/logger.js";
import {
  ERROR_MESSAGES,
  HttpMethod,
  HttpStatus,
  VERSION,
} from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import { redis } from "../../lib/redis.js";
import {
  isSandboxEnabled,
  isSandboxRuntimeAvailable,
} from "../../services/sandbox/lifecycle/control.js";

interface CreateHttpAppParams {
  isDev: boolean;
  isProd: boolean;
  allowedOrigins: string[];
  environment: Environment;
  trustProxy: unknown;
  apiBasePath: string;
}

interface ReadinessCheck {
  ok: boolean;
  detail?: string;
}

interface ReadinessSummary {
  database: ReadinessCheck;
  redis: ReadinessCheck;
  sandbox: ReadinessCheck;
}

export function createHttpApp(params: CreateHttpAppParams): express.Express {
  const { isDev, isProd, allowedOrigins, environment, trustProxy, apiBasePath } = params;
  const logger = createLogger("API");
  const app = express();

  app.set("trust proxy", trustProxy);
  app.use(createHelmetMiddleware());

  if (isProd) {
    app.use(createForceHttpsMiddleware(apiBasePath));
  }

  app.use(
    cors({
      origin: createCorsOriginChecker({ isDev, allowedOrigins }),
      credentials: true,
      methods: [
        HttpMethod.GET,
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.DELETE,
        HttpMethod.PATCH,
      ],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-file-name",
        "Last-Event-ID",
        "X-Request-Id",
      ],
      exposedHeaders: [
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "RateLimit-Scope",
        "X-Request-Id",
      ],
    }),
  );

  app.use(securityTelemetryMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  if (!isProd) {
    app.use(createRequestLoggerMiddleware(logger));
  }

  app.use("/api-key", authMiddleware, apiKeyRateLimiter, apiKeyRouter);
  app.use("/chat", authMiddleware, chatRouter);
  app.use("/github", authMiddleware, githubRouter);

  if (apiBasePath) {
    app.use(`${apiBasePath}/api-key`, authMiddleware, apiKeyRateLimiter, apiKeyRouter);
    app.use(`${apiBasePath}/chat`, authMiddleware, chatRouter);
    app.use(`${apiBasePath}/github`, authMiddleware, githubRouter);
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.status(HttpStatus.OK).json({
      status: "ok",
      version: VERSION,
      environment,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req: Request, res: Response) => {
    const checks = await evaluateReadiness();
    const ready = checks.database.ok && checks.redis.ok && checks.sandbox.ok;
    const statusCode = ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      status: ready ? "ready" : "degraded",
      version: VERSION,
      environment,
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  if (apiBasePath) {
    app.get(`${apiBasePath}/health`, (_req: Request, res: Response) => {
      res.status(HttpStatus.OK).json({
        status: "ok",
        version: VERSION,
        environment,
        timestamp: new Date().toISOString(),
      });
    });

    app.get(`${apiBasePath}/ready`, async (_req: Request, res: Response) => {
      const checks = await evaluateReadiness();
      const ready = checks.database.ok && checks.redis.ok && checks.sandbox.ok;
      const statusCode = ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

      res.status(statusCode).json({
        status: ready ? "ready" : "degraded",
        version: VERSION,
        environment,
        checks,
        timestamp: new Date().toISOString(),
      });
    });
  }

  app.use((_req: Request, res: Response) => {
    res.status(HttpStatus.NOT_FOUND).json({
      error: ERROR_MESSAGES.NOT_FOUND,
      timestamp: new Date().toISOString(),
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const error = ensureError(err);
    logger.error(error);
    captureException(error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: isProd ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR : error.message,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

async function evaluateReadiness(): Promise<ReadinessSummary> {
  const [database, redisCheck, sandbox] = await Promise.all([
    checkDatabaseReadiness(),
    checkRedisReadiness(),
    checkSandboxReadiness(),
  ]);

  return {
    database,
    redis: redisCheck,
    sandbox,
  };
}

async function checkDatabaseReadiness(): Promise<ReadinessCheck> {
  try {
    await db.select({ id: user.id }).from(user).limit(1);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      detail: ensureError(error).message,
    };
  }
}

async function checkRedisReadiness(): Promise<ReadinessCheck> {
  try {
    const response = await redis.ping();
    if (typeof response === "string" && response.toUpperCase() === "PONG") {
      return { ok: true };
    }

    return {
      ok: false,
      detail: `Unexpected Redis ping response: ${String(response)}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: ensureError(error).message,
    };
  }
}

async function checkSandboxReadiness(): Promise<ReadinessCheck> {
  if (!isSandboxEnabled()) {
    return {
      ok: true,
      detail: "disabled",
    };
  }

  const available = await isSandboxRuntimeAvailable();
  if (available) {
    return { ok: true };
  }

  return {
    ok: false,
    detail: "Docker runtime unavailable",
  };
}

function createHelmetMiddleware() {
  return helmet({
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
  });
}

function createForceHttpsMiddleware(apiBasePath: string) {
  return function forceHttpsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const requestPath = req.originalUrl.split("?")[0] ?? "/";
    if (isProbePath(requestPath, apiBasePath)) {
      next();
      return;
    }

    const forwardedProto = req
      .header("x-forwarded-proto")
      ?.split(",")
      .map((value) => value.trim().toLowerCase())[0];
    const isSecure = req.secure || forwardedProto === "https";
    if (!isSecure) {
      const host = req.hostname;
      if (!host) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: ERROR_MESSAGES.BAD_REQUEST,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const httpsUrl = `https://${host}${req.originalUrl}`;
      res.redirect(HttpStatus.PERMANENT_REDIRECT, httpsUrl);
      return;
    }

    next();
  };
}

function isProbePath(requestPath: string, apiBasePath: string): boolean {
  if (requestPath === "/health" || requestPath === "/ready") {
    return true;
  }

  if (!apiBasePath) {
    return false;
  }

  return (
    requestPath === `${apiBasePath}/health` ||
    requestPath === `${apiBasePath}/ready`
  );
}

function createCorsOriginChecker(params: {
  isDev: boolean;
  allowedOrigins: string[];
}): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  const { isDev, allowedOrigins } = params;

  return function checkOrigin(origin, callback) {
    if (isDev || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  };
}

function createRequestLoggerMiddleware(logger: ReturnType<typeof createLogger>) {
  return function requestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const startTime = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - startTime;
      logger.info(
        `${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${durationMs}ms`,
      );
    });

    next();
  };
}
