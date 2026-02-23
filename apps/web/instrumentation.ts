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

export function onRequestError(
  ...args: Parameters<typeof Sentry.captureRequestError>
): ReturnType<typeof Sentry.captureRequestError> {
  return Sentry.captureRequestError(...args);
}
