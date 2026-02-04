import { getContainer, CONTAINER_WORKDIR } from './docker.sandbox.js';
import { SandboxInstance } from './types.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { uploadFile, downloadFile } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import { Readable } from 'stream';
import path from 'path';
import zlib from 'zlib';
import { isS3Configured } from '../storage/config.js';
import { createBackupArchive } from './backup/archive.js';
import { buildS3Key } from '../storage/key.utils.js';

export async function backupSandboxInstance(sandbox: SandboxInstance): Promise<void> {
    const sandboxId = sandbox.id;
    if (!isS3Configured()) return;

    try {
        const container = getContainer(sandbox.containerId);
        try {
            await container.inspect();
        } catch (error) {
            logger.debug({ error: ensureError(error), sandboxId }, 'Container not found during backup, skipping');
            return;
        }

        const { uploadStream, completion } = await createBackupArchive(container);
        const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, 'source_backup.tar.gz');

        const uploadPromise = uploadFile(s3Key, uploadStream, {
            sandboxId,
            originalPath: 'source_backup.tar.gz',
            uploadTimestamp: new Date().toISOString(),
            type: 'source_backup'
        });

        await Promise.all([completion, uploadPromise]);
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId }, 'Source backup failed');
    }
}

export async function backupSandbox(sandboxId: string): Promise<void> {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;
    return backupSandboxInstance(sandbox);
}

export async function restoreSandboxInstance(sandbox: SandboxInstance): Promise<void> {
    if (!isS3Configured()) return;

    const sandboxId = sandbox.id;
    try {
        const backupKey = buildS3Key(sandbox.userId, sandbox.chatId, 'source_backup.tar.gz');
        const stream = await downloadFile(backupKey);

        if (!stream) {
            logger.info({ sandboxId, chatId: sandbox.chatId }, 'No source backup found on S3');
            return;
        }

        const container = getContainer(sandbox.containerId);
        const gunzip = zlib.createGunzip();
        await container.putArchive((stream as Readable).pipe(gunzip), {
            path: path.posix.dirname(CONTAINER_WORKDIR),
        });
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId, chatId: sandbox.chatId }, 'Restoration failed');
    }
}
