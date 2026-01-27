import path from 'path';
import { redis } from '../../lib/redis.js';
import { getSandboxState } from './state.sandbox.js';
import { getContainer, ensureContainerRunning, CONTAINER_WORKDIR, execCommand } from './docker.sandbox.js';
import { logger } from '../../utils/logger.js';

const BUFFER_KEY_PREFIX = 'edward:buffer:';
const BUFFER_FILES_SET_PREFIX = 'edward:buffer:files:';
const FLUSH_LOCK_PREFIX = 'edward:flush:lock:';

const WRITE_DEBOUNCE_MS = 100;
const MAX_WRITE_BUFFER = 5 * 1024 * 1024;
const FLUSH_LOCK_TTL = 30000;

const writeTimers = new Map<string, NodeJS.Timeout>();

function shEscape(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
}

async function cleanupBufferKeys(sandboxId: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
    const bufferKeys = filePaths.map(filePath =>
        `${BUFFER_KEY_PREFIX}${sandboxId}:${filePath}`
    );

    const pipeline = redis.pipeline();
    bufferKeys.forEach(key => pipeline.del(key));
    filePaths.forEach(filePath => pipeline.srem(filesSetKey, filePath));
    await pipeline.exec();
}

async function acquireLock(key: string, ttl: number, retry = false): Promise<boolean> {
    const lock = await redis.set(key, 'locked', 'PX', ttl, 'NX');
    if (lock) return true;
    if (!retry) return false;

    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        const retryLock = await redis.set(key, 'locked', 'PX', ttl, 'NX');
        if (retryLock) return true;
    }
    return false;
}

export async function flushSandbox(sandboxId: string, waitForLock = false): Promise<void> {
    const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
    const acquired = await acquireLock(lockKey, FLUSH_LOCK_TTL, waitForLock);

    if (!acquired) {
        if (waitForLock) {
            logger.error({ sandboxId }, 'Failed to acquire flush lock after retries');
        }
        return;
    }

    try {
        const sandbox = await getSandboxState(sandboxId);
        if (!sandbox) return;

        const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
        const container = getContainer(sandbox.containerId);
        await ensureContainerRunning(container);
        while (true) {
            const filePaths = await redis.smembers(filesSetKey);
            if (filePaths.length === 0) break;

            for (const filePath of filePaths) {
                const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${filePath}`;
                const processingKey = `${bufferKey}:processing`;

                try {
                    await redis.rename(bufferKey, processingKey);
                    await redis.srem(filesSetKey, filePath);
                } catch (err) {
                    continue;
                }

                const content = await redis.get(processingKey);
                if (!content) {
                    await redis.del(processingKey);
                    continue;
                }

                try {
                    const fullPath = path.posix.join(CONTAINER_WORKDIR, filePath);
                    const exec = await container.exec({
                        Cmd: ['sh', '-c', `cat >> ${shEscape(fullPath)}`],
                        AttachStdin: true,
                        AttachStdout: true,
                        AttachStderr: true,
                    });

                    const stream = await exec.start({ hijack: true });

                    await new Promise<void>((resolve, reject) => {
                        stream.on('end', resolve);
                        stream.on('error', reject);
                        stream.write(content);
                        stream.end();
                    });

                    const { ExitCode } = await exec.inspect();
                    if (ExitCode !== 0 && ExitCode !== null) {
                        logger.error({ sandboxId, filePath, ExitCode }, 'Cat command failed during flush');
                    }
                } finally {
                    await redis.del(processingKey);
                }
            }
        }
    } catch (error) {
        logger.error({ error, sandboxId }, 'Flush failed');
        throw error;
    } finally {
        await redis.del(lockKey);
    }
}

export async function writeSandboxFile(
    sandboxId: string,
    filePath: string,
    content: string
): Promise<void> {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;

    const normalizedPath = path.posix.normalize(filePath);
    if (normalizedPath.startsWith('..') || path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Invalid path: ${filePath}`);
    }

    const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${normalizedPath}`;
    const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;

    await redis.append(bufferKey, content);
    await redis.sadd(filesSetKey, normalizedPath);

    await redis.pexpire(bufferKey, 30 * 60 * 1000);
    await redis.pexpire(filesSetKey, 30 * 60 * 1000);

    const currentBufferSize = await redis.strlen(bufferKey);

    const timer = writeTimers.get(sandboxId);
    if (timer) clearTimeout(timer);

    if (currentBufferSize > MAX_WRITE_BUFFER) {
        writeTimers.delete(sandboxId);
        void flushSandbox(sandboxId);
        return;
    }

    writeTimers.set(
        sandboxId,
        setTimeout(() => {
            writeTimers.delete(sandboxId);
            void flushSandbox(sandboxId);
        }, WRITE_DEBOUNCE_MS)
    );
}

export async function prepareSandboxFile(sandboxId: string, filePath: string): Promise<void> {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const normalizedPath = path.posix.normalize(filePath);
    if (normalizedPath.startsWith('..') || path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Invalid path: ${filePath}`);
    }

    const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
    const acquired = await acquireLock(lockKey, FLUSH_LOCK_TTL, true);
    if (!acquired) {
        throw new Error(`Failed to acquire lock to prepare file: ${filePath}`);
    }

    try {
        await cleanupBufferKeys(sandboxId, [normalizedPath]);

        const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
        const dirPath = path.posix.dirname(fullPath);

        const container = getContainer(sandbox.containerId);
        await execCommand(container, ['sh', '-c', `mkdir -p ${shEscape(dirPath)} && : > ${shEscape(fullPath)}`]);
    } finally {
        await redis.del(lockKey);
    }
}

export function clearWriteTimers(sandboxId: string): void {
    const timer = writeTimers.get(sandboxId);
    if (timer) {
        clearTimeout(timer);
        writeTimers.delete(sandboxId);
    }
}

export async function clearBuffers(sandboxId: string): Promise<void> {
    const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
    const filePaths = await redis.smembers(filesSetKey);
    await cleanupBufferKeys(sandboxId, filePaths);
    await redis.del(filesSetKey);
}