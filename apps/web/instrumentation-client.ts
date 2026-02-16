import * as Sentry from "@sentry/nextjs";

const isDevelopment = process.env.NODE_ENV !== "production";
const hasSentryDsn = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

if (hasSentryDsn) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    integrations: isDevelopment ? [] : [Sentry.replayIntegration()],
    tracesSampleRate: isDevelopment ? 1 : 0.1,
    enableLogs: isDevelopment,
    replaysSessionSampleRate: isDevelopment ? 0 : 0.1,
    replaysOnErrorSampleRate: isDevelopment ? 0 : 1.0,
    sendDefaultPii: !isDevelopment,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
