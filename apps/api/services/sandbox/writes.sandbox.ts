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

export async function flushSandbox(sandboxId: string): Promise<void> {
    const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
    const acquired = await redis.set(lockKey, 'locked', 'PX', FLUSH_LOCK_TTL, 'NX');

    if (!acquired) {
        return;
    }

    try {
        const sandbox = await getSandboxState(sandboxId);
        if (!sandbox) return;

        const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
        const filePaths = await redis.smembers(filesSetKey);

        if (filePaths.length === 0) return;

        const container = getContainer(sandbox.containerId);
        await ensureContainerRunning(container);

        for (const filePath of filePaths) {
            const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${filePath}`;
            const content = await redis.get(bufferKey);

            if (!content) continue;

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

            await cleanupBufferKeys(sandboxId, [filePath]);
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

    await cleanupBufferKeys(sandboxId, [normalizedPath]);

    const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
    const dirPath = path.posix.dirname(fullPath);

    const container = getContainer(sandbox.containerId);
    await execCommand(container, ['sh', '-c', `mkdir -p ${shEscape(dirPath)} && : > ${shEscape(fullPath)}`]);
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