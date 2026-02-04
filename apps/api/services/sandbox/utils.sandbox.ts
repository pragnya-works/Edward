import { getContainer, execCommand } from './docker.sandbox.js';
import { disconnectFromNetwork } from './docker.sandbox.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';

export const TIMEOUT_CHECK_MS = 5000;
export const TIMEOUT_PACKAGE_MANAGER_INSTALL_MS = 60000;
export const TIMEOUT_DEPENDENCY_INSTALL_MS = 120000;
export const TIMEOUT_BUILD_MS = 180000;

export async function doesFileExist(containerId: string, filePath: string): Promise<boolean> {
    try {
        const container = getContainer(containerId);
        const result = await execCommand(container, ['test', '-f', filePath], false, TIMEOUT_CHECK_MS);
        return result.exitCode === 0;
    } catch (error) {
        logger.debug({ error: ensureError(error), filePath }, 'Error checking if file exists');
        return false;
    }
}

export async function doesDirectoryExist(containerId: string, directoryPath: string): Promise<boolean> {
    try {
        const container = getContainer(containerId);
        const result = await execCommand(container, ['test', '-d', directoryPath], false, TIMEOUT_CHECK_MS);
        return result.exitCode === 0;
    } catch (error) {
        logger.debug({ error: ensureError(error), directoryPath }, 'Error checking if directory exists');
        return false;
    }
}

export async function disconnectContainerFromNetwork(containerId: string, sandboxId: string): Promise<void> {
    try {
        await disconnectFromNetwork(containerId);
        logger.info({ sandboxId }, 'Disconnected container from network');
    } catch (error) {
        logger.warn({ error: ensureError(error), sandboxId }, 'Failed to disconnect container from network');
    }
}
