import 'dotenv/config';
import { ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { ChatJobPayloadSchema } from './services/queue.service.js';
import { processChatMessage } from './services/chat.service.js';
import { logger } from './utils/logger.js';
import { sqsClient, QUEUE_URL } from './lib/sqs.js';

let isShuttingDown = false;
let activeJobs = 0;

async function handleMessage(msg: Message) {
  if (!msg.Body || !msg.ReceiptHandle) return;

  activeJobs++;
  try {
    const body = JSON.parse(msg.Body);
    const payload = ChatJobPayloadSchema.parse(body);

    await processChatMessage(payload);

    await sqsClient.send(new DeleteMessageCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: msg.ReceiptHandle!,
    }));

    logger.info(`[Worker] Message deleted from queue`);
  } catch (err) {
    logger.error(err, '[Worker] Error handling message');
  } finally {
    activeJobs--;
  }
}

async function pollQueue() {
  if (!QUEUE_URL) {
    logger.error('SQS_QUEUE_URL is not defined');
    return;
  }

  logger.info('[Worker] Starting polling...');

  while (!isShuttingDown) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 20,
        AttributeNames: ['All'],
      });

      const response = await sqsClient.send(command);

      if (response.Messages && response.Messages.length > 0) {
        await Promise.all(response.Messages.map(handleMessage));
      }
    } catch (error) {
      if (!isShuttingDown) {
        logger.error(error, '[Worker] Polling error');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('[Worker] Shutting down... Waiting for active jobs to finish.');

  const shutdownStart = Date.now();
  while (activeJobs > 0) {
    if (Date.now() - shutdownStart > 30000) {
       logger.warn('[Worker] Timeout reached. Forcing exit.');
       break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  logger.info('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

pollQueue();
