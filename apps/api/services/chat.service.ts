import { db, message, MessageRole } from '@workspace/auth';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { generateResponse } from '../lib/llm/response.js';
import { ChatJobPayload } from './queue.service.js';
import { getDecryptedApiKey } from './apiKey.service.js';

export async function processChatMessage(payload: ChatJobPayload): Promise<void> {
  const { chatId, userId, content } = payload;
  logger.info(`[Service] Processing message for chat ${chatId} from user ${userId}`);

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

    logger.info(`[Service] Saved assistant response ${assistantMessageId}`);
  } catch (error) {
    logger.error(error, `[Service] Error processing message for user ${userId}`);

    const errorMessageId = nanoid(32);
    const errorContent = error instanceof Error ? error.message : 'Unknown internal error occurred';

    await db.insert(message).values({
      id: errorMessageId,
      chatId: chatId,
      userId: userId,
      role: MessageRole.Assistant,
      content: `Sorry, I encountered an error processing your request: ${errorContent}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
