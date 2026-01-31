import { CONTAINER_WORKDIR, getContainer } from './docker.sandbox.js';
import { SandboxInstance, BackupResult } from './types.sandbox.js';
import { buildS3Key, uploadFile, isS3Configured } from '../storage.service.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';
import tar from 'tar-stream';

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

        await new Promise<void>((resolve, reject) => {
            tarExtractor.on('entry', (header, fileStream, nextEntry) => {
                const relativePath = header.name.replace(/^[^/]+\/?/, '');
                if (!relativePath || header.type !== 'file') {
                    fileStream.resume();
                    nextEntry();
                    return;
                }

                if (
                    relativePath.includes('node_modules/') || 
                    relativePath.startsWith('node_modules/') ||
                    relativePath.includes('/node_modules/') ||
                    relativePath.startsWith('.') ||
                    relativePath.includes('/.')
                ) {
                    fileStream.resume();
                    nextEntry();
                    return;
                }

                uploadResults.totalFiles++;
                const s3Key = buildS3Key(sandbox.userId, sandbox.chatId, `preview/${relativePath}`);
                logger.info({ sandboxId: sandbox.id, relativePath, s3Key, buildDirectory }, 'Uploading build artifact');
                const uploadPromise = (async () => {
                    try {
                        const chunks: Buffer[] = [];
                        for await (const chunk of fileStream) {
                            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                        }
                        const fileBuffer = Buffer.concat(chunks);
                        
                        const result = await uploadFile(s3Key, fileBuffer, {
                            sandboxId: sandbox.id,
                            originalPath: relativePath,
                            uploadTimestamp,
                            buildDirectory,
                        }, fileBuffer.length);

                        if (result.success) {
                            uploadResults.successful++;
                            logger.debug({ sandboxId: sandbox.id, relativePath, size: fileBuffer.length }, 'File uploaded successfully');
                        } else {
                            uploadResults.failed++;
                            const errorMsg = result.error?.message || 'Unknown error';
                            uploadResults.errors.push(`${relativePath}: ${errorMsg}`);
                            logger.warn({
                                sandboxId: sandbox.id,
                                file: relativePath,
                                s3Key,
                                error: result.error
                            }, 'File upload failed');
                        }
                    } catch (uploadErr) {
                        uploadResults.failed++;
                        const errorMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
                        uploadResults.errors.push(`${relativePath}: ${errorMsg}`);
                        logger.error({
                            sandboxId: sandbox.id,
                            file: relativePath,
                            s3Key,
                            error: uploadErr
                        }, 'File upload threw exception');
                    } finally {
                        nextEntry();
                    }
                })();

                allUploadPromises.push(uploadPromise);
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
