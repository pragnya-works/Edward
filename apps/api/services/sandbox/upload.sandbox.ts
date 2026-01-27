import { CONTAINER_WORKDIR, getContainer } from './docker.sandbox.js';
import { SandboxInstance, BackupResult } from './types.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import tar from 'tar-stream';

const MAX_PARALLEL_UPLOADS = 5;

export async function uploadBuildFilesToS3(
    sandbox: SandboxInstance,
    buildDirectory: string
): Promise<BackupResult> {
    const uploadResults: BackupResult = {
        totalFiles: 0,
        successful: 0,
        failed: 0,
        errors: [],
    };

    if (!isS3Configured()) {
        logger.warn({ sandboxId: sandbox.id }, 'S3 not configured, skipping preview upload');
        return uploadResults;
    }

    const container = getContainer(sandbox.containerId);
    const buildPath = `${CONTAINER_WORKDIR}/${buildDirectory}`;
    const uploadTimestamp = new Date().toISOString();

    try {
        const tarArchiveStream = await container.getArchive({ path: buildPath });
        const tarExtractor = tar.extract();

        const allUploadPromises: Promise<void>[] = [];
        let currentActiveUploads = 0;

        await new Promise<void>((resolve, reject) => {
            tarExtractor.on('entry', (header, fileStream, nextEntry) => {
                const relativePath = header.name.replace(/^[^/]+\/?/, '');

                if (!relativePath || header.type !== 'file') {
                    fileStream.resume();
                    nextEntry();
                    return;
                }

                uploadResults.totalFiles++;
                const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, `previews/${relativePath}`);

                fileStream.pause();

                const uploadPromise = (async () => {
                    currentActiveUploads++;
                    try {
                        const result = await uploadFile(s3Key, fileStream, {
                            sandboxId: sandbox.id,
                            originalPath: relativePath,
                            uploadTimestamp,
                        });

                        if (result.success) {
                            uploadResults.successful++;
                        } else {
                            uploadResults.failed++;
                            uploadResults.errors.push(`${relativePath}: ${result.error?.message}`);
                        }
                    } finally {
                        currentActiveUploads--;
                    }
                })();

                allUploadPromises.push(uploadPromise);

                uploadPromise.then(() => {
                    const index = allUploadPromises.indexOf(uploadPromise);
                    if (index > -1) {
                        allUploadPromises.splice(index, 1);
                    }
                });

                if (currentActiveUploads < MAX_PARALLEL_UPLOADS) {
                    fileStream.resume();
                    nextEntry();
                } else {
                    Promise.race(allUploadPromises).then(() => {
                        fileStream.resume();
                        nextEntry();
                    });
                }
            });

            tarExtractor.on('finish', () => {
                Promise.all(allUploadPromises)
                    .then(() => resolve())
                    .catch(reject);
            });

            tarExtractor.on('error', reject);
            tarArchiveStream.pipe(tarExtractor);
        });

        logger.info({
            sandboxId: sandbox.id,
            chatId: sandbox.chatId,
            buildDirectory,
            totalFiles: uploadResults.totalFiles,
            successfulUploads: uploadResults.successful,
            failedUploads: uploadResults.failed,
        }, 'Preview upload completed');
    } catch (error) {
        const errorObj = ensureError(error);
        logger.error({ error: errorObj, sandboxId: sandbox.id, buildDirectory }, 'Failed to upload build files to S3');
        uploadResults.errors.push(`Upload failed: ${errorObj.message}`);
    }

    return uploadResults;
}
