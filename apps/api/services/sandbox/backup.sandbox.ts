import { getContainer, CONTAINER_WORKDIR } from './docker.sandbox.js';
import { SandboxInstance } from './types.sandbox.js';
import { uploadFile, downloadFile } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import { Readable } from 'stream';
import path from 'path';
import zlib from 'zlib';
import { isS3Configured } from '../storage/config.js';
import { createBackupArchive } from './backup/archive.js';
import { buildS3Key } from '../storage/key.utils.js';
import { redis } from '../../lib/redis.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

const BACKUP_EXISTS_PREFIX = 'edward:backup:exists:';
const BACKUP_EXISTS_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

async function markBackupExists(chatId: string): Promise<void> {
    try {
        await redis.set(`${BACKUP_EXISTS_PREFIX}${chatId}`, '1', 'EX', BACKUP_EXISTS_TTL);
    } catch (error) {
        logger.warn({ error, chatId }, 'Failed to set backup existence flag');
    }
}

export async function hasBackup(chatId: string): Promise<boolean> {
    try {
        const exists = await redis.get(`${BACKUP_EXISTS_PREFIX}${chatId}`);
        return exists === '1';
    } catch (error) {
        logger.warn({ error, chatId }, 'Failed to check backup existence flag');
        return false;
    }
}

export async function hasBackupOnS3(
  chatId: string,
  userId: string,
): Promise<boolean> {
  try {
    const key = buildS3Key(userId, chatId, 'source_backup.tar.gz');
    const { s3Client } = await import('../storage/config.js');
    const { BUCKET_NAME } = await import('../storage/config.js');
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch (err: unknown) {
    const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    logger.warn({ chatId, userId, err }, 'S3 HeadObject check failed');
    return false;
  }
}

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
        await markBackupExists(sandbox.chatId);
        logger.info({ sandboxId, chatId: sandbox.chatId }, 'Source backup completed and flagged');
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId }, 'Source backup failed');
    }
}

export async function restoreSandboxInstance(sandbox: SandboxInstance): Promise<void> {
    if (!isS3Configured()) return;

    const sandboxId = sandbox.id;
    try {
        const backupExists = await hasBackup(sandbox.chatId);
        if (!backupExists) {
            logger.debug({ sandboxId, chatId: sandbox.chatId }, 'No backup flag found, skipping S3 restore');
            return;
        }

        const backupKey = buildS3Key(sandbox.userId, sandbox.chatId, 'source_backup.tar.gz');
        const stream = await downloadFile(backupKey);

        if (!stream) {
            logger.info({ sandboxId, chatId: sandbox.chatId }, 'Backup flag exists but no file found on S3, skipping restore');
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
