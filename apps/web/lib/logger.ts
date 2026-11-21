type LogContext = Record<string, unknown>;

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

export const logger = {
  warn(scope: string, message: string, context?: LogContext): void {
    if (context) {
      console.warn(format(scope, message), context);
      return;
    }
    console.warn(format(scope, message));
  },

  error(
    scope: string,
    message: string,
    error: unknown,
    context?: LogContext,
  ): void {
    console.error(format(scope, message), { ...context, error });
  },
};
