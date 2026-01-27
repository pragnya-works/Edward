import { ConnectionOptions } from 'bullmq';

export const QUEUE_NAME = 'chat-processing-queue';

const host = process.env.REDIS_HOST;
const port = parseInt(process.env.REDIS_PORT || '', 10);

if (!host) {
  throw new Error('REDIS_HOST environment variable is missing');
}

if (isNaN(port)) {
  throw new Error('REDIS_PORT environment variable is missing or invalid');
}

export const connection: ConnectionOptions = {
  host,
  port,
};
