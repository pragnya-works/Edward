import { db, message, MessageRole, user, eq } from '@workspace/auth';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { decrypt } from '../utils/encryption.js';
import { generateResponse } from '../lib/llm/response.js';
import { ChatJobPayload } from './queue.service.js';

export async function processChatMessage(payload: ChatJobPayload): Promise<void> {
  logger.info(`[Service] Processing message for chat ${payload.chatId} from user ${payload.userId}`);

  try {
    const [userData] = await db
      .select({ apiKey: user.apiKey })
      .from(user)
      .where(eq(user.id, payload.userId))
      .limit(1);

    if (!userData?.apiKey) {
      throw new Error(`No API key found for user ${payload.userId}`);
    }

    const decryptedApiKey = decrypt(userData.apiKey);
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
    await db.insert(message).values({
      id: errorMessageId,
      chatId: payload.chatId,
      userId: payload.userId,
      role: MessageRole.Assistant,
      content: `Sorry, I encountered an error processing your request: ${(error as Error).message}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
