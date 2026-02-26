import { db, sql } from "@edward/auth";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("API");

export async function ensureChatSeoColumns(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "chat" ADD COLUMN IF NOT EXISTS "seo_title" text`,
  );
  await db.execute(
    sql`ALTER TABLE "chat" ADD COLUMN IF NOT EXISTS "seo_description" text`,
  );

  logger.info("Schema compatibility check passed for chat SEO columns");
}

