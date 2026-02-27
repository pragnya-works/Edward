import { db, chat, message, attachment, MessageRole, eq } from "@edward/auth";
import { nanoid } from "nanoid";
import { logger } from "../utils/logger.js";
import type { AllowedImageMimeType } from "../utils/imageValidation/types.js";
import { normalizeUserMessageText } from "../utils/userMessageText.js";

export interface MessageMetadata {
  completionTime?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ImageAttachment {
  url: string;
  mimeType: AllowedImageMimeType;
  name?: string;
}

function isMissingChatSeoColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('column "seo_title" does not exist') ||
    message.includes('column "seo_description" does not exist')
  );
}

export async function getOrCreateChat(
  userId: string,
  chatId: string | undefined,
  chatData: { title?: string; description?: string },
): Promise<{
  chatId: string;
  isNewChat: boolean;
  error?: string;
  status?: number;
}> {
  try {
    const now = new Date();
    const title = chatData.title || "New Chat";
    const description = chatData.description;

    if (!chatId) {
      const newChatId = nanoid(32);
      const baseInsert = {
        id: newChatId,
        userId,
        title,
        description,
        createdAt: now,
        updatedAt: now,
      };


      try {
        await db.insert(chat).values({
          ...baseInsert,
          seoTitle: title,
          seoDescription: description,
        });
      } catch (error) {
        if (!isMissingChatSeoColumnError(error)) {
          throw error;
        }

        logger.warn(
          { newChatId, userId },
          "Chat SEO columns missing, retrying chat insert without SEO fields",
        );
        await db.insert(chat).values(baseInsert);
      }
      return { chatId: newChatId, isNewChat: true };
    }

    const [existing] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existing) {
      return { chatId, isNewChat: false, error: "Chat not found", status: 404 };
    }

    if (existing.userId !== userId) {
      return { chatId, isNewChat: false, error: "Forbidden", status: 403 };
    }

    return { chatId, isNewChat: false };
  } catch (error) {
    logger.error({ error, userId, chatId }, "Failed to get or create chat");
    return {
      chatId: chatId || "",
      isNewChat: false,
      error: "Internal service error during chat operation",
      status: 500,
    };
  }
}

export async function saveMessage(
  chatId: string,
  userId: string,
  role: MessageRole,
  content: string,
  id?: string,
  metadata?: MessageMetadata,
): Promise<string> {
  try {
    const messageId = id || nanoid(32);
    const now = new Date();
    const normalizedContent =
      role === MessageRole.User ? normalizeUserMessageText(content) : content;

    const values: {
      id: string;
      chatId: string;
      userId: string;
      role: MessageRole;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      completionTime?: number;
      inputTokens?: number;
      outputTokens?: number;
    } = {
      id: messageId,
      chatId,
      userId,
      role,
      content: normalizedContent,
      createdAt: now,
      updatedAt: now,
    };

    if (metadata) {
      if (metadata.completionTime !== undefined) {
        values.completionTime = metadata.completionTime;
      }
      if (metadata.inputTokens !== undefined) {
        values.inputTokens = metadata.inputTokens;
      }
      if (metadata.outputTokens !== undefined) {
        values.outputTokens = metadata.outputTokens;
      }
    }

    await db
      .insert(message)
      .values(values as typeof message.$inferInsert)
      .onConflictDoUpdate({
        target: message.id,
        set: {
          content: normalizedContent,
          updatedAt: now,
          ...(metadata?.completionTime !== undefined && {
            completionTime: metadata.completionTime,
          }),
          ...(metadata?.inputTokens !== undefined && {
            inputTokens: metadata.inputTokens,
          }),
          ...(metadata?.outputTokens !== undefined && {
            outputTokens: metadata.outputTokens,
          }),
        },
      });

    return messageId;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: err, userId, chatId, role },
      "Failed to save message",
    );
    throw new Error(`Failed to save message to database: ${err}`);
  }
}

export async function updateChatMeta(
  chatId: string,
  data: {
    title?: string;
    description?: string;
    seoTitle?: string;
    seoDescription?: string;
  },
): Promise<void> {
  try {
    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (data.title !== undefined) {
      updates.title = data.title;
      updates.seoTitle = data.seoTitle ?? data.title;
    }
    if (data.description !== undefined) {
      updates.description = data.description;
      updates.seoDescription = data.seoDescription ?? data.description;
    }
    if (data.seoTitle !== undefined && data.title === undefined) {
      updates.seoTitle = data.seoTitle;
    }
    if (data.seoDescription !== undefined && data.description === undefined) {
      updates.seoDescription = data.seoDescription;
    }

    try {
      await db.update(chat).set(updates).where(eq(chat.id, chatId));
    } catch (error) {
      if (!isMissingChatSeoColumnError(error)) {
        throw error;
      }

      const fallbackUpdates: Record<string, unknown> = { updatedAt: now };
      if (data.title !== undefined) {
        fallbackUpdates.title = data.title;
      }
      if (data.description !== undefined) {
        fallbackUpdates.description = data.description;
      }

      logger.warn(
        { chatId },
        "Chat SEO columns missing, retrying metadata update without SEO fields",
      );
      await db.update(chat).set(fallbackUpdates).where(eq(chat.id, chatId));
    }
  } catch (error) {
    logger.error({ error, chatId }, "Failed to update chat metadata");
  }
}

export async function saveAttachments(
  messageId: string,
  images: ImageAttachment[],
): Promise<string[]> {
  if (!images || images.length === 0) return [];

  const attachmentIds: string[] = [];
  const now = new Date();

  try {
    for (const image of images) {
      const attachmentId = nanoid(32);

      await db.insert(attachment).values({
        id: attachmentId,
        messageId,
        name:
          image.name ||
          `image-${attachmentId}.${image.mimeType.split("/")[1] || "bin"}`,
        url: image.url,
        type: "image",
        createdAt: now,
        updatedAt: now,
      });

      attachmentIds.push(attachmentId);
    }

    logger.info(
      { messageId, attachmentCount: attachmentIds.length },
      "Saved image attachments",
    );

    return attachmentIds;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logger.error({ error: err, messageId }, "Failed to save attachments");
    throw new Error(`Failed to save attachments: ${err}`);
  }
}
