import * as Sentry from "@sentry/nextjs";

enum NextRuntime {
  NODEJS = "nodejs",
  EDGE = "edge",
}

export async function register() {
  if (process.env.NEXT_RUNTIME === NextRuntime.NODEJS) {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === NextRuntime.EDGE) {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
