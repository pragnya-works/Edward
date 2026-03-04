import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import { logger } from "../utils/logger.js";
import { config } from "../app.config.js";

function resolveRedisOptions(): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.username ? { username: config.redis.username } : {}),
    ...(config.redis.password ? { password: config.redis.password } : {}),
    ...(config.redis.db !== undefined ? { db: config.redis.db } : {}),
    ...(config.redis.tls ? { tls: config.redis.tls } : {}),
    maxRetriesPerRequest: null,
  };
}

export const redis = new Redis(resolveRedisOptions());

redis.on("error", (error) => {
  logger.error(error, "Redis Connection Error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

export function createRedisClient(overrides: RedisOptions = {}): Redis {
  return new Redis({
    ...resolveRedisOptions(),
    ...overrides,
  });
}
