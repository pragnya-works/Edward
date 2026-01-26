import { getContainer, CONTAINER_WORKDIR } from './docker.sandbox.js';
import { SandboxInstance, BackupResult, S3File } from './types.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured, downloadFile, listFolder } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import { Readable } from 'stream';
import tar from 'tar-stream';
import path from 'path';

const MAX_CONCURRENT_UPLOADS = 5;

export async function backupSandboxInstance(sandbox: SandboxInstance): Promise<void> {
    const sandboxId = sandbox.id;

    if (!isS3Configured()) return;

    try {
        const container = getContainer(sandbox.containerId);

        try {
            await container.inspect();
        } catch (error) {
            logger.debug({ sandboxId, error: ensureError(error).message }, 'Backup skipped: container not found');
            return;
        }

        const uploadTimestamp = new Date().toISOString();
        const tarStream = await container.getArchive({ path: CONTAINER_WORKDIR });

        const results: BackupResult = {
            totalFiles: 0,
            successful: 0,
            failed: 0,
            errors: []
        };

        const extract = tar.extract();
        const uploadQueue: Promise<void>[] = [];

        extract.on('entry', async (header, stream, next) => {
            const relativePath = header.name.replace(/^[^/]+\/?/, '');
            
            if (!relativePath || header.type !== 'file') {
                stream.resume();
                return next();
            }

            results.totalFiles++;
            const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, relativePath);

            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            
            stream.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                
                const uploadTask = (async () => {
                    const uploadResult = await uploadFile(s3Key, buffer, {
                        sandboxId,
                        originalPath: relativePath,
                        uploadTimestamp,
                    });

                    if (uploadResult.success) {
                        results.successful++;
                    } else {
                        results.failed++;
                        results.errors.push(`${relativePath}: ${uploadResult.error?.message}`);
                    }
                })();

                uploadQueue.push(uploadTask);

                if (uploadQueue.length >= MAX_CONCURRENT_UPLOADS) {
                    await Promise.all(uploadQueue.splice(0, uploadQueue.length - MAX_CONCURRENT_UPLOADS + 1));
                }
                
                next();
            });

            stream.on('error', (err) => {
                results.failed++;
                results.errors.push(`${relativePath}: ${err.message}`);
                next();
            });
        });

        await new Promise((resolve, reject) => {
            tarStream.pipe(extract);
            extract.on('finish', resolve);
            extract.on('error', reject);
        });

        await Promise.all(uploadQueue);

        const logLevel = results.failed === 0 ? 'info' : 'warn';
        logger[logLevel]({ sandboxId, ...results }, 'Extracted sandbox backup completed');
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId }, 'Backup failed');
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
        const folderPrefix = buildS3Key(sandbox.userId, sandbox.chatId);
        const items: S3File[] = await listFolder(folderPrefix);

        if (items.length === 0) {
            logger.info({ sandboxId, chatId: sandbox.chatId, folderPrefix }, 'No assets found in S3 to restore');
            return;
        }

        const container = getContainer(sandbox.containerId);
        const pack = tar.pack();

        const restorePath = path.posix.dirname(CONTAINER_WORKDIR);

        logger.info({ sandboxId, chatId: sandbox.chatId, fileCount: items.length }, 'Restoring workspace from S3 files');
        const uploadPromise = container.putArchive(pack as unknown as Readable, {
            path: restorePath,
        });

        for (const item of items) {
            const key = item.Key;
            const size = item.Size;

            const relativePath = key.replace(folderPrefix, '');
            if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) continue;

            const stream = await downloadFile(key);
            if (!stream) {
                logger.warn({ key }, 'Failed to download file during restoration');
                continue;
            }

            const name = path.posix.join('edward', relativePath);
            const entry = pack.entry({ name, size });
            (stream as Readable).pipe(entry);

            await new Promise((resolve, reject) => {
                entry.on('finish', resolve);
                entry.on('error', reject);
                (stream as Readable).on('error', reject);
            });
        }

        pack.finalize();
        await uploadPromise;

        logger.info({ sandboxId, chatId: sandbox.chatId }, 'Restoration successful');
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId, chatId: sandbox.chatId }, 'Restoration failed');
    }
}
