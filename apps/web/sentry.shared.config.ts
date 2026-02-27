import * as Sentry from "@sentry/nextjs";
import { getValidatedSentryDsn } from "./lib/sentryDsn";

const NODE_ENV_PRODUCTION = "production";
const sentryDsn = getValidatedSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN,
  "server",
);

export function initSentryForServerRuntime(): void {
  if (!sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: process.env.NODE_ENV === NODE_ENV_PRODUCTION ? 0.1 : 1,
    enableLogs: process.env.NODE_ENV !== NODE_ENV_PRODUCTION,
    sendDefaultPii: false,
  });
}
