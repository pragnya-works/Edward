import { db } from "./db.js";
import { build } from "./schema.js";
import { and, eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { BuildRecordStatus } from "@edward/shared/api/contracts";

export async function createBuild(data: {
  chatId: string;
  messageId: string;
  status?: BuildRecordStatus;
  forceNew?: boolean;
}): Promise<typeof build.$inferSelect | undefined> {
  if (!data.forceNew) {
    const existing = await db.query.build.findFirst({
      where: and(eq(build.chatId, data.chatId), eq(build.messageId, data.messageId)),
      orderBy: [desc(build.createdAt)],
    });
    if (existing) {
      return existing;
    }
  }

  const id = nanoid();

  let attempts = 0;
  const MAX_RETRIES = 3;

  while (attempts < MAX_RETRIES) {
    try {
      const result = await db
        .insert(build)
        .values({
          id,
          chatId: data.chatId,
          messageId: data.messageId,
          status: data.status || BuildRecordStatus.QUEUED,
        })
        .returning();
      return result[0];
    } catch (error) {
      attempts++;
      if (attempts >= MAX_RETRIES) throw error;
      if (error !== null && typeof error === "object" && (error as { code?: string }).code === "23503") {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to create build");
}

export async function updateBuild(
  id: string,
  data: Partial<{
    status: BuildRecordStatus;
    errorReport: Record<string, unknown> | null;
    previewUrl: string | null;
    buildDuration: number | null;
  }>,
) {
  const result = await db
    .update(build)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(build.id, id))
    .returning();
  return result[0];
}

export async function getLatestBuildByChatId(chatId: string) {
  const result = await db.query.build.findFirst({
    where: eq(build.chatId, chatId),
    orderBy: [desc(build.createdAt)],
  });
  return result;
}
