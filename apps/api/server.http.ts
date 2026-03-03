import "dotenv/config";
import "./utils/sentry.js";
import { captureException } from "./utils/sentry.js";
import {
  initSandboxService,
  shutdownSandboxService,
} from "./services/sandbox/lifecycle/control.js";
import { redis } from "./lib/redis.js";
import { shutdownRedisPubSub } from "./lib/redisPubSub.js";
import { Environment, createLogger } from "./utils/logger.js";
import { VERSION } from "./utils/constants.js";
import { ensureError } from "./utils/error.js";
import { config } from "./app.config.js";
import { registerProcessHandlerOnce } from "./utils/processHandlers.js";
import { createHttpApp } from "./server/http/app.factory.js";

const PORT = config.server.port;
const ENV = config.server.environment as Environment;
const isDev = config.server.isDevelopment();
const isProd = config.server.isProduction();
const allowedOrigins = config.cors.origins;

const logger = createLogger("API");
const app = createHttpApp({
  isDev,
  isProd,
  allowedOrigins,
  environment: ENV,
  trustProxy: config.server.trustProxy,
});

let serverInstance: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function bootstrapServer(): Promise<void> {
  try {
    await initSandboxService();
    logger.info("Sandbox Service initialized.");
  } catch (error) {
    logger.error(ensureError(error), "Failed during startup");
    process.exit(1);
    return;
  }

  serverInstance = app.listen(PORT, () => {
    logger.info(`Edward API v${VERSION} listening on port ${PORT} [Mode: ${ENV}]`);
  });
}
await bootstrapServer();
async function closeHttpServer(): Promise<void> {
  if (!serverInstance) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    serverInstance?.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function handleGracefulShutdown(signal: string, exitCode: number = 0) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting cleanup...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error("Shutdown timeout reached. Forcing exit.");
    process.exit(1);
  }, 15_000);

  try {
    await closeHttpServer();
    await Promise.all([
      shutdownSandboxService(),
      shutdownRedisPubSub(),
      redis.quit(),
    ]);
    logger.info("Graceful shutdown successful.");
    clearTimeout(shutdownTimeout);
    process.exit(exitCode);
  } catch (error) {
    logger.error(ensureError(error), "Error during shutdown");
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

registerProcessHandlerOnce("api:SIGINT", "SIGINT", () => {
  void handleGracefulShutdown("SIGINT");
});

registerProcessHandlerOnce("api:SIGTERM", "SIGTERM", () => {
  void handleGracefulShutdown("SIGTERM");
});

registerProcessHandlerOnce("api:uncaughtException", "uncaughtException", (error) => {
  logger.fatal(error, "Uncaught Exception");
  captureException(error);
  void handleGracefulShutdown("uncaughtException", 1);
});

registerProcessHandlerOnce("api:unhandledRejection", "unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled Rejection");
  captureException(reason);
  void handleGracefulShutdown("unhandledRejection", 1);
});
