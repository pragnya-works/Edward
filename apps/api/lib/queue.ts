import { ConnectionOptions } from 'bullmq';

export const QUEUE_NAME = 'chat-processing-queue';

export const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT as string),
  password: process.env.REDIS_PASSWORD,
};
