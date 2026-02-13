import { db, chat, message, MessageRole, eq } from '@edward/auth';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

export interface MessageMetadata {
  completionTime?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export async function getOrCreateChat(
  userId: string,
  chatId: string | undefined,
  chatData: { title?: string, description?: string, visibility?: boolean }
): Promise<{ chatId: string, isNewChat: boolean, error?: string, status?: number }> {
  try {
    const now = new Date();

    if (!chatId) {
      const newChatId = nanoid(32);
      await db.insert(chat).values({
        id: newChatId,
        userId,
        title: chatData.title || 'New Chat',
        description: chatData.description,
        visibility: chatData.visibility || false,
        createdAt: now,
        updatedAt: now,
      });
      return { chatId: newChatId, isNewChat: true };
    }

    const [existing] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existing) {
      return { chatId, isNewChat: false, error: 'Chat not found', status: 404 };
    }

    if (existing.userId !== userId) {
      return { chatId, isNewChat: false, error: 'Forbidden', status: 403 };
    }

    return { chatId, isNewChat: false };
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Failed to get or create chat');
    return { chatId: chatId || '', isNewChat: false, error: 'Internal service error during chat operation', status: 500 };
  }
}

export async function saveMessage(
  chatId: string,
  userId: string,
  role: MessageRole,
  content: string,
  id?: string,
  metadata?: MessageMetadata
): Promise<string> {
  try {
    const messageId = id || nanoid(32);
    const now = new Date();

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
      content,
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

    await db.insert(message).values(values as typeof message.$inferInsert).onConflictDoUpdate({
      target: message.id,
      set: {
        content,
        updatedAt: now,
        ...(metadata?.completionTime !== undefined && { completionTime: metadata.completionTime }),
        ...(metadata?.inputTokens !== undefined && { inputTokens: metadata.inputTokens }),
        ...(metadata?.outputTokens !== undefined && { outputTokens: metadata.outputTokens }),
      }
    });

    return messageId;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logger.error({ error: err, userId, chatId, role }, 'Failed to save message');
    throw new Error(`Failed to save message to database: ${err}`);
  }
}