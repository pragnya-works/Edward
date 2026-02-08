import { disconnectFromNetwork } from './docker.sandbox.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';

export const TIMEOUT_DEPENDENCY_INSTALL_MS = 120000;
export const TIMEOUT_BUILD_MS = 180000;

export async function disconnectContainerFromNetwork(containerId: string, sandboxId: string): Promise<void> {
    try {
        await disconnectFromNetwork(containerId);
        logger.info({ sandboxId }, 'Disconnected container from network');
    } catch (error) {
        logger.warn({ error: ensureError(error), sandboxId }, 'Failed to disconnect container from network');
    }
}
