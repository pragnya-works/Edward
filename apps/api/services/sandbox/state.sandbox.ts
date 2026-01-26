import { redis } from '../../lib/redis.js';
import { SandboxInstance } from './types.sandbox.js';
import { logger } from '../../utils/logger.js';

const SANDBOX_KEY_PREFIX = 'edward:sandbox:';
const CHAT_SANDBOX_INDEX_PREFIX = 'edward:chat:sandbox:';
const SANDBOX_TTL = 30 * 60 * 1000;

export async function saveSandboxState(sandbox: SandboxInstance): Promise<void> {
    try {
        const key = `${SANDBOX_KEY_PREFIX}${sandbox.id}`;
        await redis.set(key, JSON.stringify(sandbox), 'PX', SANDBOX_TTL);
        await redis.set(`${CHAT_SANDBOX_INDEX_PREFIX}${sandbox.chatId}`, sandbox.id, 'PX', SANDBOX_TTL);
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

export async function getSandboxIdByChat(chatId: string): Promise<string | null> {
    try {
        return await redis.get(`${CHAT_SANDBOX_INDEX_PREFIX}${chatId}`);
    } catch (error) {
        logger.error({ error, chatId }, 'Failed to get sandbox ID by chat from Redis');
        return null;
    }
}

export async function getActiveSandbox(chatId: string): Promise<string | undefined> {
    const sandboxId = await getSandboxIdByChat(chatId);
    if (sandboxId) {
        const sandbox = await getSandboxState(sandboxId);
        if (sandbox) {
            sandbox.expiresAt = Date.now() + SANDBOX_TTL;
            await saveSandboxState(sandbox);
            return sandbox.id;
        }
    }
    return undefined;
}
