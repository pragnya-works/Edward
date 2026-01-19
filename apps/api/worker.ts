import 'dotenv/config';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { db, message, MessageRole } from '@workspace/auth';
import { nanoid } from 'nanoid';
import { ChatJobPayloadSchema, type ChatJobPayload } from './services/queue.service.js';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;

async function processMessage(payload: ChatJobPayload) {
  console.log(`[Worker] Processing message for chat ${payload.chatId} from user ${payload.userId}`);

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

  console.log(`[Worker] Saved assistant response ${assistantMessageId}`);
}

async function pollQueue() {
  if (!QUEUE_URL) {
    console.error('SQS_QUEUE_URL is not defined');
    return;
  }

  console.log('[Worker] Starting polling...');

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

            console.log(`[Worker] Message deleted from queue`);

          } catch (err) {
            console.error('[Worker] Error processing message:', err);
          }
        }
      }
    } catch (error) {
      console.error('[Worker] Polling error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

pollQueue();
