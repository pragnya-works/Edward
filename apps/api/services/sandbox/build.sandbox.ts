import { getContainer, CONTAINER_WORKDIR, connectToNetwork, execCommand } from './docker.sandbox.js';
import { getSandboxState } from './state.sandbox.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';

import {
    TIMEOUT_PACKAGE_MANAGER_INSTALL_MS,
    TIMEOUT_DEPENDENCY_INSTALL_MS,
    TIMEOUT_BUILD_MS,
    disconnectContainerFromNetwork
} from './utils.sandbox.js';

import {
    PackageManager,
    detectPackageManager,
    isPackageManagerInstalled,
    findBuildOutputDirectory,
    isStaticSite
} from './detect.sandbox.js';

import { ensureNextJsConfig } from './config.sandbox.js';
import { uploadBuildFilesToS3 } from './upload.sandbox.js';

export interface BuildResult {
    success: boolean;
    buildDirectory: string | null;
    error?: string;
    previewUploaded: boolean;
    previewStats?: {
        totalFiles: number;
        successfulUploads: number;
        failedUploads: number;
    };
}

async function installPackageManagerGlobally(
    containerId: string,
    packageManager: PackageManager,
    sandboxId: string
): Promise<boolean> {
    if (packageManager === 'npm') {
        return true;
    }

    const alreadyInstalled = await isPackageManagerInstalled(containerId, packageManager);
    if (alreadyInstalled) {
        return true;
    }

    logger.info({ sandboxId, packageManager }, `Installing ${packageManager} globally`);

    try {
        const container = getContainer(containerId);
        const installCommand = ['npm', 'install', '-g', packageManager];
        const result = await execCommand(container, installCommand, false, TIMEOUT_PACKAGE_MANAGER_INSTALL_MS, 'root');

        if (result.exitCode !== 0) {
            logger.error({
                sandboxId,
                packageManager,
                exitCode: result.exitCode,
                stderr: result.stderr.slice(0, 500),
            }, `Failed to install ${packageManager} globally`);
            return false;
        }

        logger.info({ sandboxId, packageManager }, `Successfully installed ${packageManager}`);
        return true;
    } catch (error) {
        logger.error({ error: ensureError(error), sandboxId, packageManager }, `Error installing ${packageManager}`);
        return false;
    }
}

function getInstallCommand(packageManager: PackageManager): string[] {
    if (packageManager === 'pnpm') {
        return ['pnpm', 'install'];
    }
    if (packageManager === 'yarn') {
        return ['yarn', 'install'];
    }
    return ['npm', 'install'];
}

function getBuildCommand(packageManager: PackageManager): string[] {
    return [packageManager, 'run', 'build'];
}

async function installDependencies(
    containerId: string,
    packageManager: PackageManager,
    sandboxId: string
): Promise<{ success: boolean; error?: string }> {
    const packageManagerReady = await installPackageManagerGlobally(containerId, packageManager, sandboxId);
    if (!packageManagerReady) {
        return { success: false, error: `Failed to install ${packageManager}` };
    }

    try {
        const container = getContainer(containerId);
        const installCommand = getInstallCommand(packageManager);
        const result = await execCommand(container, installCommand, false, TIMEOUT_DEPENDENCY_INSTALL_MS, undefined, CONTAINER_WORKDIR, ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']);

        if (result.exitCode !== 0) {
            let packageJsonContent = 'Unknown';
            try {
                const pkgResult = await execCommand(container, ['cat', 'package.json'], false, 2000, undefined, CONTAINER_WORKDIR);
                if (pkgResult.exitCode === 0) {
                    packageJsonContent = pkgResult.stdout;
                }
            } catch (pkgError) {
                logger.debug({ pkgError }, 'Failed to read package.json for error report');
            }
            return {
                success: false,
                error: `Dependency installation failed with exit code ${result.exitCode}. Stderr: ${result.stderr}. package.json: ${packageJsonContent}`,
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Dependency installation error: ${ensureError(error).message}`,
        };
    }
}

async function runBuildCommand(
    containerId: string,
    packageManager: PackageManager
): Promise<{ success: boolean; error?: string }> {
    try {
        const container = getContainer(containerId);
        const buildCommand = getBuildCommand(packageManager);
        const result = await execCommand(container, buildCommand, false, TIMEOUT_BUILD_MS, undefined, CONTAINER_WORKDIR, ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']);

        if (result.exitCode !== 0) {
            let packageJsonContent = 'Unknown';
            try {
                const pkgResult = await execCommand(container, ['cat', 'package.json'], false, 2000, undefined, CONTAINER_WORKDIR);
                if (pkgResult.exitCode === 0) {
                    packageJsonContent = pkgResult.stdout;
                }
            } catch (pkgError) {
                logger.debug({ pkgError }, 'Failed to read package.json for error report');
            }

            return {
                success: false,
                error: `Build failed with exit code ${result.exitCode}. Stderr: ${result.stderr}. package.json: ${packageJsonContent}`,
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Build error: ${ensureError(error).message}`,
        };
    }
}

export async function buildAndUploadPreview(sandboxId: string): Promise<BuildResult> {
    const result: BuildResult = {
        success: false,
        buildDirectory: null,
        previewUploaded: false,
    };

    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
        result.error = 'Sandbox not found';
        return result;
    }

    const containerId = sandbox.containerId;
    let isConnectedToNetwork = false;

    try {
        const container = getContainer(containerId);
        try {
            await container.inspect();
        } catch {
            result.error = 'Container not found';
            return result;
        }

        const packageManager = await detectPackageManager(containerId);
        if (!packageManager) {
            const isStatic = await isStaticSite(containerId);
            if (isStatic) {
                logger.info({ sandboxId }, 'No package.json found but index.html exists. Treating as static site.');
                result.success = true;
                result.buildDirectory = '.'; 

                logger.info({ sandboxId, buildDirectory: '.' }, 'Uploading static site files to S3');
                const uploadResult = await uploadBuildFilesToS3(sandbox, '.');
                
                if (uploadResult.totalFiles > 0) {
                    result.previewUploaded = uploadResult.successful > 0;
                    result.previewStats = {
                        totalFiles: uploadResult.totalFiles,
                        successfulUploads: uploadResult.successful,
                        failedUploads: uploadResult.failed,
                    };
                }
                
                return result;
            }

            logger.info({ sandboxId }, 'No package.json found, skipping build');
            result.error = 'No package.json found';
            return result;
        }

        logger.info({ sandboxId, packageManager }, 'Connecting container to network for dependency installation');

        try {
            await connectToNetwork(containerId);
            isConnectedToNetwork = true;
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (networkError) {
            const errorObj = ensureError(networkError);
            result.error = `Failed to connect to network: ${errorObj.message}`;
            logger.error({ error: errorObj, sandboxId }, 'Network connection failed');
            return result;
        }

        logger.info({ sandboxId, packageManager }, 'Installing dependencies');

        const installResult = await installDependencies(containerId, packageManager, sandboxId);

        if (!installResult.success) {
            result.error = installResult.error;
            logger.warn({ sandboxId, error: installResult.error }, 'Dependency installation failed');
            return result;
        }

        logger.info({ sandboxId }, 'Dependencies installed successfully');
        logger.info({ sandboxId, packageManager }, 'Running build command');

        await ensureNextJsConfig(containerId, CONTAINER_WORKDIR);

        const buildResult = await runBuildCommand(containerId, packageManager);
        await disconnectContainerFromNetwork(containerId, sandboxId);
        isConnectedToNetwork = false;

        if (!buildResult.success) {
            result.error = buildResult.error;
            logger.warn({ sandboxId, error: buildResult.error }, 'Build command failed');
            return result;
        }

        logger.info({ sandboxId }, 'Build completed successfully');

        const buildDirectory = await findBuildOutputDirectory(containerId);
        if (!buildDirectory) {
            result.error = 'No build output directory found';
            logger.warn({ sandboxId }, 'Build completed but no output directory found');
            return result;
        }

        result.buildDirectory = buildDirectory;
        result.success = true;

        logger.info({ sandboxId, buildDirectory }, 'Uploading build files to S3');

        const uploadResult = await uploadBuildFilesToS3(sandbox, buildDirectory);

        if (uploadResult.totalFiles > 0) {
            result.previewUploaded = uploadResult.successful > 0;
            result.previewStats = {
                totalFiles: uploadResult.totalFiles,
                successfulUploads: uploadResult.successful,
                failedUploads: uploadResult.failed,
            };
        }

        return result;
    } catch (error) {
        const errorObj = ensureError(error);
        result.error = errorObj.message;
        logger.error({ error: errorObj, sandboxId }, 'Build and upload process failed');
        return result;
    } finally {
        if (isConnectedToNetwork) {
            await disconnectContainerFromNetwork(containerId, sandboxId);
        }
    }
}
