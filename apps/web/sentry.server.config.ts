import * as Sentry from "@sentry/nextjs";

const NODE_ENV_PRODUCTION = "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === NODE_ENV_PRODUCTION ? 0.1 : 1,

  enableLogs: process.env.NODE_ENV !== NODE_ENV_PRODUCTION,

  sendDefaultPii: false,
});
