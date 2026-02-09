import { Redis } from "ioredis";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
});

redis.on("error", (error) => {
  logger.error(error, "Redis Connection Error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

export function createRedisClient(): Redis {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
  });
}
