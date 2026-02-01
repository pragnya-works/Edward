import { getContainer, execCommand, CONTAINER_WORKDIR, connectToNetwork } from '../docker.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { TIMEOUT_DEPENDENCY_INSTALL_MS, disconnectContainerFromNetwork } from '../utils.sandbox.js';
import { getSandboxState } from '../state.sandbox.js';

const FRAMEWORK_CORE_DEPS: Record<string, { deps: string[]; devDeps: string[] }> = {
    nextjs: {
        deps: ['react', 'react-dom', 'next'],
        devDeps: ['typescript', '@types/node', '@types/react', '@types/react-dom', 'postcss', 'tailwindcss', '@tailwindcss/postcss']
    },
    'vite-react': {
        deps: ['react', 'react-dom'],
        devDeps: ['typescript', '@types/react', '@types/react-dom', 'vite', '@vitejs/plugin-react', 'tailwindcss', '@tailwindcss/vite']
    },
    vanilla: {
        deps: [],
        devDeps: []
    }
};

export async function mergeAndInstallDependencies(
    containerId: string,
    packages: string[],
    sandboxId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const container = getContainer(containerId);
        const state = await getSandboxState(sandboxId);
        const framework = state?.scaffoldedFramework || 'vanilla';
        const coreConfig = FRAMEWORK_CORE_DEPS[framework] ?? FRAMEWORK_CORE_DEPS.vanilla!;
        const allDeps = [...new Set([...coreConfig.deps, ...packages])];
        const devDeps = coreConfig.devDeps;

        if (allDeps.length === 0 && devDeps.length === 0) {
            return { success: true };
        }

        logger.info({ sandboxId, framework, deps: allDeps.length, devDeps: devDeps.length }, 'Installing framework + user dependencies');
        await connectToNetwork(containerId);

        if (devDeps.length > 0) {
            const devResult = await execCommand(
                container,
                ['pnpm', 'add', '-D', ...devDeps],
                false,
                TIMEOUT_DEPENDENCY_INSTALL_MS,
                undefined,
                CONTAINER_WORKDIR,
                ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']
            );

            if (devResult.exitCode !== 0) {
                logger.error({
                    sandboxId,
                    exitCode: devResult.exitCode,
                    stdout: devResult.stdout.slice(0, 500),
                    stderr: devResult.stderr.slice(0, 500)
                }, 'Dev dependency install failed');

                await disconnectContainerFromNetwork(containerId, sandboxId);

                return {
                    success: false,
                    error: `Failed to install dev dependencies: ${devResult.stderr || devResult.stdout}`.slice(0, 300)
                };
            }
        } else {
            await disconnectContainerFromNetwork(containerId, sandboxId);
        }
        logger.info({ sandboxId, framework }, 'Successfully installed all dependencies');
        return { success: true };
    } catch (error) {
        await disconnectContainerFromNetwork(containerId, sandboxId).catch(() => { });
        logger.error({ error, sandboxId }, 'Error in dependency merger');
        return {
            success: false,
            error: `Dependency merger error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
