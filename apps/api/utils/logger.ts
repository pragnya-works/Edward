import pino from "pino";

export enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

const env = (process.env.NODE_ENV as Environment) || Environment.Development;
const isProduction = env === Environment.Production;

const REDACT_PATHS = [
  'req',
  'request',
  'res',
  'response',
  'req.headers',
  'request.headers',
  'req.body',
  'request.body',
  'headers.authorization',
  'authorization',
  'apiKey',
  'apikey',
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  'secrets',
  'key',
  'keys',
  'error.config',
  'error.request',
  'error.response',
  'error.metadata',
  'metadata',
  '$metadata',
];

export const createLogger = (processName?: string) => {
  return pino({
    level: isProduction ? 'info' : 'debug',
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      error: pino.stdSerializers.err,
      err: pino.stdSerializers.err,
    },
    transport: !isProduction
      ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      }
      : undefined,
    base: {
      env,
      ...(processName && { process: processName }),
    },
  });
};

export const logger = createLogger();

export type Logger = typeof logger;