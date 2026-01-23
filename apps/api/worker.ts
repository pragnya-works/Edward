import 'dotenv/config';
import { Worker } from 'bullmq';
import { ChatJobPayloadSchema, ChatJobPayload } from './services/queue.service.js';
import { processChatMessage } from './services/chat.service.js';
import { createLogger } from './utils/logger.js';
import { connection, QUEUE_NAME } from './lib/queue.js';

const logger = createLogger('WORKER');

const worker = new Worker<ChatJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const payload = ChatJobPayloadSchema.parse(job.data);
    await processChatMessage(payload);
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  logger.info(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(err, `[Worker] Job ${job?.id} failed`);
});

async function gracefulShutdown() {
  logger.info('[Worker] Shutting down...');
  await worker.close();
  logger.info('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

logger.info('[Worker] Started listening for jobs...');