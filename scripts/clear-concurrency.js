#!/usr/bin/env node
import { Redis } from "ioredis";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../apps/api/.env") });

const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = Number(process.env.REDIS_PORT) || 6379;

async function clearConcurrencyKeys() {
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
  });

  try {
    console.log(`📡 Connecting to Redis at ${redisHost}:${redisPort}...`);

    let cursor = "0";
    let totalDeleted = 0;
    const batchSize = 100;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "user:concurrency:*",
        "COUNT",
        batchSize,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
        console.log(`🗑️  Deleted batch of ${keys.length} keys...`);
      }
    } while (cursor !== "0");

    if (totalDeleted === 0) {
      console.log("✅ No active concurrency slots found.");
    } else {
      console.log(`✨ Cleared ${totalDeleted} concurrency slots successfully.`);
    }
  } catch (error) {
    console.error("❌ Error clearing concurrency keys:", error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

clearConcurrencyKeys();