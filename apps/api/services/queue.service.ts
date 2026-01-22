import { Queue } from 'bullmq';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { connection, QUEUE_NAME } from '../lib/queue.js';

export const ChatJobPayloadSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  content: z.string(),
});

export type ChatJobPayload = z.infer<typeof ChatJobPayloadSchema>;

const chatQueue = new Queue<ChatJobPayload>(QUEUE_NAME, {
  connection,
});

export async function enqueueChatJob(payload: ChatJobPayload): Promise<void> {
  const validatedPayload = ChatJobPayloadSchema.parse(payload);

  try {
    await chatQueue.add(
      'process-chat-message', 
      validatedPayload,
      {
        jobId: validatedPayload.messageId,
        removeOnComplete: true,
        removeOnFail: false, 
      }
    );
    logger.info(`[Queue] Job enqueued for user ${validatedPayload.userId}, chat ${validatedPayload.chatId}`);
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue job');
    throw new Error('Failed to enqueue message for processing');
  }
}