import { Redis } from 'ioredis';
import { logger } from '../../utils/logger.js';

interface BuildStatusEvent {
    buildId: string;
    status: 'success' | 'failed';
    previewUrl?: string;
    errorLog?: string;
}

export function createBuildStatusSubscriber(chatId: string, onMessage: (data: BuildStatusEvent) => void) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const subClient = new Redis(redisUrl);
    const channel = `edward:build-status:${chatId}`;

    subClient.subscribe(channel, (err) => {
        if (err) {
            logger.error({ err, chatId }, '[BuildStatusSubscriber] Failed to subscribe');
            return;
        }
        logger.debug({ chatId, channel }, '[BuildStatusSubscriber] Subscribed to build status');
    });

    subClient.on('message', (chan, message) => {
        if (chan === channel) {
            try {
                const data = JSON.parse(message);
                onMessage(data);
            } catch (err) {
                logger.error({ err, message }, '[BuildStatusSubscriber] Failed to parse message');
            }
        }
    });

    return () => {
        subClient.unsubscribe(channel).catch(() => { });
        subClient.quit().catch(() => { });
    };
}
