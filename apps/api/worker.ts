import 'dotenv/config';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { db, message, MessageRole } from '@workspace/auth';
import { nanoid } from 'nanoid';
import { ChatJobPayloadSchema, type ChatJobPayload } from './services/queue.service.js';
import { logger } from '@workspace/logger';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;

async function processMessage(payload: ChatJobPayload) {
  logger.info(`[Worker] Processing message for chat ${payload.chatId} from user ${payload.userId}`);

  // TODO: Integrate with actual LLM here.
  const aiResponseContent = `Echo: ${payload.content}. (Processed by worker)`;

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

  logger.info(`[Worker] Saved assistant response ${assistantMessageId}`);
}

async function pollQueue() {
  if (!QUEUE_URL) {
    logger.error('SQS_QUEUE_URL is not defined');
    return;
  }

  logger.info('[Worker] Starting polling...');

  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        AttributeNames: ['All'],
      });

      const response = await sqsClient.send(command);

      if (response.Messages && response.Messages.length > 0) {
        for (const msg of response.Messages) {
          if (!msg.Body || !msg.ReceiptHandle) continue;

          try {
            const body = JSON.parse(msg.Body);
            const payload = ChatJobPayloadSchema.parse(body);

            await processMessage(payload);

            await sqsClient.send(new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle,
            }));

            logger.info(`[Worker] Message deleted from queue`);

          } catch (err) {
            logger.error(err, '[Worker] Error processing message');
          }
        }
      }
    } catch (error) {
      logger.error(error, '[Worker] Polling error');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

pollQueue();
