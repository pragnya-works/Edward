import { getContainer, CONTAINER_WORKDIR } from './docker.sandbox.js';
import { SandboxInstance, BackupResult, S3File } from './types.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured, downloadFile, listFolder } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import { Readable } from 'stream';
import tar from 'tar-stream';
import { predictBuildDirectory } from './detect.sandbox.js';
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

            if (!relativePath || header.type !== 'file' ||
                relativePath.includes('node_modules/') ||
                relativePath.includes('.next/') ||
                relativePath.startsWith('dist/') ||
                relativePath.startsWith('build/') ||
                relativePath.startsWith('out/') ||
                relativePath.startsWith('.output/') ||
                relativePath.startsWith('preview/')
            ) {
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

        logger.info({ sandboxId }, 'Backup completed');
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
        const allItems: S3File[] = await listFolder(folderPrefix);

        if (allItems.length === 0) {
            logger.info({ sandboxId, chatId: sandbox.chatId }, 'No assets found in S3 to restore');
            return;
        }

        const sourceItems = allItems.filter(item => {
            const rel = item.Key.replace(folderPrefix, '');
            if (!rel) return false;

            if (rel.startsWith('_next/') ||
                rel === 'index.html' ||
                rel === '404.html' ||
                rel === 'index.txt' ||
                rel.startsWith('preview/') ||
                rel.startsWith('previews/')) {
                return false;
            }

            return true;
        });

        const previewItems = allItems.filter(item => {
            const rel = item.Key.replace(folderPrefix, '');
            return rel && (rel.startsWith('preview/') || rel.startsWith('previews/'));
        });

        const container = getContainer(sandbox.containerId);
        const restorePath = path.posix.dirname(CONTAINER_WORKDIR);

        if (sourceItems.length > 0) {
            logger.info({ sandboxId, fileCount: sourceItems.length }, 'Restoring source files');
            const sourcePack = tar.pack();
            const sourceUploadPromise = container.putArchive(sourcePack as unknown as Readable, {
                path: restorePath,
            });

            for (const item of sourceItems) {
                const relativePath = item.Key.replace(folderPrefix, '');
                const stream = await downloadFile(item.Key);
                if (!stream) continue;

                const name = path.posix.join(path.posix.basename(CONTAINER_WORKDIR), relativePath);
                const entry = sourcePack.entry({ name, size: item.Size });
                (stream as Readable).pipe(entry);
                await new Promise((res, rej) => {
                    entry.on('finish', res);
                    entry.on('error', rej);
                });
            }
            sourcePack.finalize();
            await sourceUploadPromise;
        }

        if (previewItems.length > 0) {
            const buildDirectory = await predictBuildDirectory(sandbox.containerId);
            logger.info({ sandboxId, buildDirectory, fileCount: previewItems.length }, 'Restoring preview files to build directory');

            const previewPack = tar.pack();
            const previewUploadPromise = container.putArchive(previewPack as unknown as Readable, {
                path: restorePath,
            });

            for (const item of previewItems) {
                const relativePath = item.Key.replace(folderPrefix, '').replace(/^(?:preview|previews)\//, '');
                const stream = await downloadFile(item.Key);
                if (!stream) continue;

                const name = path.posix.join(path.posix.basename(CONTAINER_WORKDIR), buildDirectory, relativePath);
                const entry = previewPack.entry({ name, size: item.Size });
                (stream as Readable).pipe(entry);
                await new Promise((res, rej) => {
                    entry.on('finish', res);
                    entry.on('error', rej);
                });
            }
            previewPack.finalize();
            await previewUploadPromise;
        }

        logger.info({ sandboxId, chatId: sandbox.chatId }, 'Restoration successful');
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId, chatId: sandbox.chatId }, 'Restoration failed');
    }
}
