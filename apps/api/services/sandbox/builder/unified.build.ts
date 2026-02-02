import { connectToNetwork, getContainer, execCommand, CONTAINER_WORKDIR } from '../docker.sandbox.js';
import { getSandboxState } from '../state.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { ensureError } from '../../../utils/error.js';
import { runUnifiedBuild, BuildOptions } from '../../builder.service.js';
import { uploadBuildFilesToS3, uploadSpaFallback } from '../upload.sandbox.js';
import { buildPreviewUrl } from '../../preview.service.js';
import { disconnectContainerFromNetwork } from '../utils.sandbox.js';
import { Framework } from '../../planning/schemas.js';
import { mergeAndInstallDependencies } from '../templates/dependency.merger.js';

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
    const container = getContainer(containerId);
    const requestedPackages = sandbox.requestedPackages || [];

    const nodeModulesCheck = await execCommand(
      container,
      ['test', '-d', 'node_modules'],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR
    );

    if (nodeModulesCheck.exitCode !== 0 || requestedPackages.length > 0) {
      if (nodeModulesCheck.exitCode !== 0) {
        logger.warn({ sandboxId }, 'node_modules missing before build, triggering installation');
      }

      const installResult = await mergeAndInstallDependencies(containerId, requestedPackages, sandboxId);
      if (!installResult.success) {
        await disconnectContainerFromNetwork(containerId, sandboxId);
        return {
          success: false,
          buildDirectory: null,
          error: `Dependency installation failed: ${installResult.error}`,
          previewUploaded: false,
          previewUrl: null
        };
      }
    }

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

    return {
      success: allSuccessful,
      buildDirectory,
      previewUploaded: uploadResult.successful > 0,
      previewUrl: allSuccessful ? previewUrl : null,
      error: allSuccessful ? undefined : `Upload incomplete: ${uploadResult.successful}/${uploadResult.totalFiles} files uploaded`
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
