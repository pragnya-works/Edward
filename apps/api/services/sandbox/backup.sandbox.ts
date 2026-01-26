import { listFilesInContainer, readFileStreamFromContainer, getContainer } from './docker.sandbox.js';
import { SandboxInstance } from './types.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { BackupResult } from './types.sandbox.js';

const MAX_CONCURRENT_UPLOADS = 10;

export async function backupSandboxInstance(sandbox: SandboxInstance): Promise<void> {
    const sandboxId = sandbox.id;

    if (!isS3Configured()) {
        return;
    }

    try {
        const container = getContainer(sandbox.containerId);

        try {
            await container.inspect();
        } catch (error) {
            return;
        }

        const files = await listFilesInContainer(container);
        if (files.length === 0) return;

        const result: BackupResult = {
            totalFiles: files.length,
            successful: 0,
            failed: 0,
            errors: [],
        };

        const uploadTimestamp = new Date().toISOString();

        for (let i = 0; i < files.length; i += MAX_CONCURRENT_UPLOADS) {
            const batch = files.slice(i, i + MAX_CONCURRENT_UPLOADS);

            const uploadResults = await Promise.allSettled(
                batch.map(async (file) => {
                    const stream = await readFileStreamFromContainer(container, file.path);
                    const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, file.path);
                    const uploadResult = await uploadFile(s3Key, stream, {
                        sandboxId,
                        originalPath: file.path,
                        uploadTimestamp,
                    });

                    if (!uploadResult.success) {
                        throw uploadResult.error || new Error('Upload failed');
                    }

                    return file.path;
                })
            );

            for (const uploadResult of uploadResults) {
                if (uploadResult.status === 'fulfilled') {
                    result.successful++;
                } else {
                    result.failed++;
                    const errorMsg = uploadResult.reason?.message || 'Unknown error';
                    result.errors.push(errorMsg);
                }
            }
        }

        const logLevel = result.failed === 0 ? 'info' : 'warn';
        logger[logLevel](
            {
                sandboxId,
                containerId: sandbox.containerId,
                filesBackedUp: result.successful,
                ...result,
                errors: result.errors.length > 5
                    ? [...result.errors.slice(0, 5), `...and ${result.errors.length - 5} more`]
                    : result.errors,
            },
            'Sandbox backup completed'
        );
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ error: err, sandboxId }, 'Backup failed');
    }
}

export async function backupSandbox(sandboxId: string): Promise<void> {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;
    return backupSandboxInstance(sandbox);
}
