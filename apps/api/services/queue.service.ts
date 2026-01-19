import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { z } from 'zod';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;

export const ChatJobPayloadSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  content: z.string(),
});

export type ChatJobPayload = z.infer<typeof ChatJobPayloadSchema>;

export async function enqueueChatJob(payload: ChatJobPayload): Promise<void> {
  if (!QUEUE_URL) {
    console.error('SQS_QUEUE_URL is not defined');
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
    console.log(`[Queue] Job enqueued for user ${validatedPayload.userId}, chat ${validatedPayload.chatId}`);
  } catch (error) {
    console.error('[Queue] Failed to enqueue job:', error);
    throw new Error('Failed to enqueue message for processing');
  }
}
