import { Redis } from "ioredis";
import { logger } from "../utils/logger.js";
import { config } from "../app.config.js";

interface RedisClientConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

function getRedisClientOptions() {
  const { host, port, username, password, tls } =
    config.redis.connectionOptions as RedisClientConnectionOptions;
  return {
    host,
    port,
    username,
    password,
    tls,
    maxRetriesPerRequest: null as null,
  };
}

export const redis = new Redis({
  ...getRedisClientOptions(),
});

redis.on("error", (error) => {
  logger.error(error, "Redis Connection Error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

export function createRedisClient(): Redis {
  return new Redis(getRedisClientOptions());
}
