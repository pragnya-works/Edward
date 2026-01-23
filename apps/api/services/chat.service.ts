import { db, message, MessageRole } from '@workspace/auth';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { generateResponse } from '../lib/llm/response.js';
import { ChatJobPayload } from './queue.service.js';
import { getDecryptedApiKey } from './apiKey.service.js';

export async function processChatMessage(payload: ChatJobPayload): Promise<void> {
  logger.info(`[Service] Processing message for chat ${payload.chatId} from user ${payload.userId}`);

  try {
    const decryptedApiKey = await getDecryptedApiKey(payload.userId);
    const aiResponseContent = await generateResponse(decryptedApiKey, payload.content);
    const assistantMessageId = nanoid(32);

    await db.insert(message).values({
      id: assistantMessageId,
      chatId: payload.chatId,
      userId: payload.userId,
      role: MessageRole.Assistant,
      content: aiResponseContent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info(`[Service] Saved assistant response ${assistantMessageId}`);
  } catch (error) {
    logger.error(error, `[Service] Error processing message for user ${payload.userId}`);

    const errorMessageId = nanoid(32);
    const errorContent = error instanceof Error ? error.message : 'Unknown error';

    await db.insert(message).values({
      id: errorMessageId,
      chatId: payload.chatId,
      userId: payload.userId,
      role: MessageRole.Assistant,
      content: `Sorry, I encountered an error processing your request: ${errorContent}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
