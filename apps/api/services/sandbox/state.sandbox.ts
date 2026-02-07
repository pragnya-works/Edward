import { redis } from '../../lib/redis.js';
import { SandboxInstance } from './types.sandbox.js';
import { logger } from '../../utils/logger.js';

const SANDBOX_KEY_PREFIX = 'edward:sandbox:';
const CHAT_SANDBOX_INDEX_PREFIX = 'edward:chat:sandbox:';
const CHAT_FRAMEWORK_PREFIX = 'edward:chat:framework:';
const SANDBOX_TTL = 30 * 60 * 1000;
const FRAMEWORK_TTL = 7 * 24 * 60 * 60;

export async function saveSandboxState(sandbox: SandboxInstance): Promise<void> {
    try {
        const key = `${SANDBOX_KEY_PREFIX}${sandbox.id}`;
        await redis.set(key, JSON.stringify(sandbox), 'PX', SANDBOX_TTL);
        await redis.set(`${CHAT_SANDBOX_INDEX_PREFIX}${sandbox.chatId}`, sandbox.id, 'PX', SANDBOX_TTL);
        if (sandbox.scaffoldedFramework) {
            await redis.set(
                `${CHAT_FRAMEWORK_PREFIX}${sandbox.chatId}`,
                sandbox.scaffoldedFramework,
                'EX',
                FRAMEWORK_TTL
            );
        }
    } catch (error) {
        logger.error({ error, sandboxId: sandbox.id }, 'Failed to save sandbox state to Redis');
        throw new Error('Failed to persist sandbox state');
    }
}

export async function getSandboxState(sandboxId: string): Promise<SandboxInstance | null> {
    try {
        const data = await redis.get(`${SANDBOX_KEY_PREFIX}${sandboxId}`);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        logger.error({ error, sandboxId }, 'Failed to get sandbox state from Redis');
        return null;
    }
}

export async function deleteSandboxState(sandboxId: string, chatId?: string): Promise<void> {
    try {
        await redis.del(`${SANDBOX_KEY_PREFIX}${sandboxId}`);
        if (chatId) {
            await redis.del(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`);
        }
    } catch (error) {
        logger.error({ error, sandboxId }, 'Failed to delete sandbox state from Redis');
    }
}

async function getSandboxIdByChat(chatId: string): Promise<string | null> {
    try {
        return await redis.get(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`);
    } catch (error) {
        logger.error({ error, chatId }, 'Failed to get sandbox ID by chat from Redis');
        return null;
    }
}

export async function getActiveSandboxState(chatId: string): Promise<SandboxInstance | null> {
    try {
        const sandboxId = await getSandboxIdByChat(chatId);
        if (!sandboxId) return null;
        return await getSandboxState(sandboxId);
    } catch (error) {
        logger.error({ error, chatId }, 'Failed to get active sandbox state');
        return null;
    }
}

export async function refreshSandboxTTL(sandboxId: string, chatId?: string): Promise<void> {
    try {
        const pipeline = redis.pipeline();
        pipeline.pexpire(`${SANDBOX_KEY_PREFIX}${sandboxId}`, SANDBOX_TTL);
        if (chatId) {
            pipeline.pexpire(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`, SANDBOX_TTL);
        }
        await pipeline.exec();
    } catch (error) {
        logger.error({ error, sandboxId }, 'Failed to refresh sandbox TTL');
    }
}

export async function getChatFramework(chatId: string): Promise<string | null> {
    try {
        return await redis.get(`${CHAT_FRAMEWORK_PREFIX}${chatId}`);
    } catch (error) {
        logger.warn({ error, chatId }, 'Failed to get chat framework from Redis');
        return null;
    }
}
