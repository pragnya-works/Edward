import * as Sentry from "@sentry/nextjs";
import { getValidatedSentryDsn } from "./lib/sentryDsn";

const NODE_ENV_PRODUCTION = "production";
const isDevelopment = process.env.NODE_ENV !== NODE_ENV_PRODUCTION;
const sentryDsn = getValidatedSentryDsn(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  "client",
);

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: isDevelopment ? [] : [Sentry.replayIntegration()],
    tracesSampleRate: isDevelopment ? 1 : 0.1,
    enableLogs: isDevelopment,
    replaysSessionSampleRate: isDevelopment ? 0 : 0.1,
    replaysOnErrorSampleRate: isDevelopment ? 0 : 1.0,
    sendDefaultPii: !isDevelopment,
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<typeof Sentry.captureRouterTransitionStart>
): ReturnType<typeof Sentry.captureRouterTransitionStart> {
  return Sentry.captureRouterTransitionStart(...args);
}
