import { getContainer, CONTAINER_WORKDIR } from './docker.sandbox.js';
import { SandboxInstance } from './types.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured, downloadFile } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import { Readable } from 'stream';
import tar from 'tar-stream';
import zlib from 'zlib';
import path from 'path';

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

        const tarStream = await container.getArchive({ path: CONTAINER_WORKDIR });
        const extract = tar.extract();
        const pack = tar.pack();
        const gzip = zlib.createGzip();

        const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, 'source_backup.tar.gz');
        extract.on('entry', (header, stream, next) => {
            const relativePath = header.name.replace(/^[^/]+\/?/, '');

            if (!relativePath || 
                relativePath.includes('node_modules/') ||
                relativePath.includes('.next/') ||
                relativePath.startsWith('dist/') ||
                relativePath.startsWith('build/') ||
                relativePath.startsWith('out/') ||
                relativePath.startsWith('.output/') ||
                relativePath.startsWith('preview/') ||
                relativePath.startsWith('previews/')
            ) {
                stream.resume();
                return next();
            }

            const entry = pack.entry(header, next);
            stream.pipe(entry);
        });

        const backupPromise = new Promise((resolve, reject) => {
            extract.on('finish', () => {
                pack.finalize();
                resolve(true);
            });
            extract.on('error', reject);
            pack.on('error', reject);
            gzip.on('error', reject);
        });
        const uploadPromise = uploadFile(s3Key, pack.pipe(gzip), {
            sandboxId,
            originalPath: 'source_backup.tar.gz',
            uploadTimestamp: new Date().toISOString(),
            type: 'source_backup'
        });

        tarStream.pipe(extract);
        await Promise.all([backupPromise, uploadPromise]);

        logger.info({ sandboxId }, 'Source backup (archived) completed');
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
        
        logger.info({ sandboxId }, 'Restoring source from archive');
        
        await container.putArchive((stream as Readable).pipe(gunzip), {
            path: path.posix.dirname(CONTAINER_WORKDIR),
        });

        logger.info({ sandboxId, chatId: sandbox.chatId }, 'Restoration successful');
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId, chatId: sandbox.chatId }, 'Restoration failed');
    }
}
