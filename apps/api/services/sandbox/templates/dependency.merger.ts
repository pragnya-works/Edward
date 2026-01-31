import { getContainer, execCommand, CONTAINER_WORKDIR, connectToNetwork } from '../docker.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { TIMEOUT_DEPENDENCY_INSTALL_MS, disconnectContainerFromNetwork } from '../utils.sandbox.js';

export async function mergeAndInstallDependencies(
    containerId: string,
    packages: string[],
    sandboxId: string
): Promise<{ success: boolean; error?: string }> {
    if (packages.length === 0) return { success: true };

    try {
        const container = getContainer(containerId);
        logger.info({ sandboxId, packages }, 'Merging and installing additional dependencies');
        await connectToNetwork(containerId);
        const result = await execCommand(
            container,
            ['pnpm', 'add', ...packages],
            false,
            TIMEOUT_DEPENDENCY_INSTALL_MS,
            undefined,
            CONTAINER_WORKDIR,
            ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']
        );

        await disconnectContainerFromNetwork(containerId, sandboxId);
        if (result.exitCode !== 0) {
            logger.error({
                sandboxId,
                exitCode: result.exitCode,
                stdout: result.stdout.slice(0, 500),
                stderr: result.stderr.slice(0, 500)
            }, 'Dependency merge/install failed');

            return {
                success: false,
                error: `Failed to install dependencies: ${result.stderr || result.stdout}`.slice(0, 300)
            };
        }

        logger.info({ sandboxId }, 'Successfully merged and installed dependencies');
        return { success: true };
    } catch (error) {
        await disconnectContainerFromNetwork(containerId, sandboxId).catch(() => {});
        logger.error({ error, sandboxId }, 'Error in dependency merger');
        return {
            success: false,
            error: `Dependency merger error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
