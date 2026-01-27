import { db, chat, message, MessageRole, eq } from '@edward/auth';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { generateResponse } from '../lib/llm/response.js';
import { ChatJobPayload } from './queue.service.js';
import { getDecryptedApiKey } from './apiKey.service.js';

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
  id?: string
): Promise<string> {
  try {
    const messageId = id || nanoid(32);
    const now = new Date();

    await db.insert(message).values({
      id: messageId,
      chatId,
      userId,
      role: role,
      content,
      createdAt: now,
      updatedAt: now,
    });

    return messageId;
  } catch (error) {
    logger.error({ error, userId, chatId, role }, 'Failed to save message');
    throw new Error('Failed to save message to database');
  }
}

export async function processChatMessage(payload: ChatJobPayload): Promise<void> {
  const { chatId, userId, content } = payload;
  try {
    const decryptedApiKey = await getDecryptedApiKey(userId);

    const aiResponseContent = await generateResponse(decryptedApiKey, content);

    const assistantMessageId = nanoid(32);

    await db.insert(message).values({
      id: assistantMessageId,
      chatId: chatId,
      userId: userId,
      role: MessageRole.Assistant,
      content: aiResponseContent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  } catch (error) {
    logger.error(error, `[Service] Error processing message for user ${userId}`);

    const errorMessageId = nanoid(32);

    await db.insert(message).values({
      id: errorMessageId,
      chatId: chatId,
      userId: userId,
      role: MessageRole.Assistant,
      content: 'Sorry, I encountered an internal error while processing your request.',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
