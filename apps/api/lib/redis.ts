import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

const redisHost = process.env.REDIS_HOST;
const redisPort = Number(process.env.REDIS_PORT);

if (!redisHost || !redisPort) {
    logger.warn('REDIS_HOST or REDIS_PORT not defined. Redis features may fail.');
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
