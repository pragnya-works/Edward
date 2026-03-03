import * as Sentry from "@sentry/node";
import { Environment } from "./logger.js";

const isProd = process.env.NODE_ENV === Environment.Production;
const sentryState = globalThis as typeof globalThis & {
  __edwardSentryInitialized?: boolean;
};

if (process.env.SENTRY_DSN && !sentryState.__edwardSentryInitialized) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: isProd ? Environment.Production : Environment.Development,
    enableLogs: true,
    tracesSampleRate: isProd ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
  sentryState.__edwardSentryInitialized = true;
}

export const captureException: typeof Sentry.captureException =
  Sentry.captureException;
