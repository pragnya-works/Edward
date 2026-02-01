import { connectToNetwork } from '../docker.sandbox.js';
import { getSandboxState } from '../state.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { ensureError } from '../../../utils/error.js';
import { runUnifiedBuild, BuildOptions } from '../../builder.service.js';
import { uploadBuildFilesToS3, uploadSpaFallback } from '../upload.sandbox.js';
import { buildPreviewUrl } from '../../preview.service.js';
import { disconnectContainerFromNetwork } from '../utils.sandbox.js';
import { Framework } from './base-path.injector.js';

export interface BuildResult {
  success: boolean;
  buildDirectory: string | null;
  error?: string;
  previewUploaded: boolean;
  previewUrl: string | null;
}

export async function buildAndUploadUnified(sandboxId: string): Promise<BuildResult> {
  const sandbox = await getSandboxState(sandboxId);

  if (!sandbox) {
    return {
      success: false,
      buildDirectory: null,
      error: 'Sandbox not found',
      previewUploaded: false,
      previewUrl: null
    };
  }

  const { containerId, userId, chatId, scaffoldedFramework } = sandbox;

  try {
    await connectToNetwork(containerId);

    const buildOptions: BuildOptions | undefined = userId && chatId
      ? { userId, chatId, framework: scaffoldedFramework }
      : undefined;

    const buildResult = await runUnifiedBuild(containerId, sandboxId, buildOptions);

    if (!buildResult.success) {
      await disconnectContainerFromNetwork(containerId, sandboxId);
      return {
        success: false,
        buildDirectory: buildResult.outputInfo?.directory || null,
        error: buildResult.error,
        previewUploaded: false,
        previewUrl: null
      };
    }

    const buildDirectory = buildResult.outputInfo!.directory;
    logger.info({ sandboxId, buildDirectory }, 'Uploading build artifacts to S3');

    const framework = (scaffoldedFramework || 'vanilla') as Framework;
    const uploadResult = await uploadBuildFilesToS3(sandbox, buildDirectory, framework);

    if (framework !== 'vanilla') {
      await uploadSpaFallback(sandbox, framework).catch(err =>
        logger.warn({ err, sandboxId }, 'SPA fallback upload failed')
      );
    }

    await disconnectContainerFromNetwork(containerId, sandboxId);

    const previewUrl = buildPreviewUrl(userId, chatId);
    const allSuccessful = uploadResult.totalFiles === uploadResult.successful;

    logger.info({
      sandboxId,
      success: allSuccessful,
    }, 'Unified build and upload completed');

    return {
      success: true,
      buildDirectory,
      previewUploaded: uploadResult.successful > 0,
      previewUrl
    };
  } catch (error) {
    await disconnectContainerFromNetwork(containerId, sandboxId).catch(() => { });
    const err = ensureError(error);
    logger.error({ error: err, sandboxId }, 'Unified build/upload orchestration failed');

    return {
      success: false,
      buildDirectory: null,
      error: err.message,
      previewUploaded: false,
      previewUrl: null
    };
  }
}
