import pino from "pino";

export enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

const env = (process.env.NODE_ENV as Environment) || Environment.Development;
const isProduction = env === Environment.Production;

export const createLogger = (processName?: string) => {
  return pino({
    level: isProduction ? 'info' : 'debug',
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