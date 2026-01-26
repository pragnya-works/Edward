import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

const redisHost = process.env.REDIS_HOST;
const redisPort = Number(process.env.REDIS_PORT);

if (!redisHost || !redisPort) {
    throw new Error('REDIS_HOST or REDIS_PORT not defined. Cannot initialize Redis.');
}

export const redis = new Redis({
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
});

redis.on('error', (error) => {
    logger.error(error, 'Redis Connection Error');
});

redis.on('connect', () => {
    logger.info('Connected to Redis');
});
