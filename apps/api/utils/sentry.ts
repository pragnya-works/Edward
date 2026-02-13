import * as Sentry from "@sentry/node";
import { Environment } from "./logger.js";

const isProd = process.env.NODE_ENV === Environment.Production;

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: isProd ? Environment.Production : Environment.Development,
    enableLogs: true,
    tracesSampleRate: isProd ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}

export { Sentry };
