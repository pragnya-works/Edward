import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { sqsClient, QUEUE_URL } from '../lib/sqs.js';

export const ChatJobPayloadSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  content: z.string(),
});

export type ChatJobPayload = z.infer<typeof ChatJobPayloadSchema>;

export async function enqueueChatJob(payload: ChatJobPayload): Promise<void> {
  if (!QUEUE_URL) {
    logger.error('SQS_QUEUE_URL is not defined');
    return;
  }

  const validatedPayload = ChatJobPayloadSchema.parse(payload);

  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(validatedPayload),
    MessageGroupId: validatedPayload.userId,
    MessageDeduplicationId: validatedPayload.messageId,
  });

  try {
    await sqsClient.send(command);
    logger.info(`[Queue] Job enqueued for user ${validatedPayload.userId}, chat ${validatedPayload.chatId}`);
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue job');
    throw new Error('Failed to enqueue message for processing');
  }
}
